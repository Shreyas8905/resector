"""Stage 3 API: agent link suggestions, gap finding, run log."""
import asyncio
import json
import logging
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .dashboards import _dash, get_db
from .dashboards_ai import AIConfig, _runner, _wrap
from .database import AgentRun, CanvasNode, Document, DocStatus, WireSuggestion
from .services import wire_ai

logger = logging.getLogger(__name__)
router = APIRouter()


def _sugg(s: WireSuggestion) -> dict:
    return {"id": s.id, "a_kind": s.a_kind, "a_ref": s.a_ref, "b_kind": s.b_kind, "b_ref": s.b_ref,
            "relation": s.relation, "summary": s.summary, "confidence": s.confidence, "status": s.status,
            "evidence": json.loads(s.evidence or "[]")}


def _run(r: AgentRun, with_result: bool = False) -> dict:
    out = {"id": r.id, "kind": r.kind, "status": r.status, "total": r.total, "done": r.done, "found": r.found,
           "tokens_in": r.tokens_in, "tokens_out": r.tokens_out, "message": r.message or "",
           "created_at": r.created_at, "finished_at": r.finished_at}
    if with_result:
        out["result"] = json.loads(r.result) if r.result else []
    return out


class WireIn(AIConfig):
    document_ids: Optional[List[int]] = None
    include_claims: bool = True
    max_pairs: int = 12
    rerun: bool = False


def _start(db, d, kind: str) -> AgentRun:
    live = db.query(AgentRun).filter(AgentRun.dashboard_id == d.id, AgentRun.status == "running").all()
    for r in live:
        if r.id in wire_ai.RUNS:
            raise HTTPException(status_code=409, detail="Another check is already running on this dashboard.")
        r.status, r.message = "failed", "Interrupted (the app was restarted)."
    run = AgentRun(dashboard_id=d.id, kind=kind, status="running")
    db.add(run)
    db.commit()
    return run


@router.post("/dashboards/{dash_id}/wire/run")
async def wire_run(dash_id: str, body: WireIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    runner = _runner(body)
    run = _start(db, d, "wire")
    entry = {"cancel": False}
    wire_ai.RUNS[run.id] = entry
    entry["task"] = asyncio.create_task(wire_ai.run_wire(
        run.id, d.id, d.session_id, runner, body.document_ids, body.include_claims,
        max(1, min(body.max_pairs, 40)), body.rerun))
    return {"run_id": run.id}


@router.post("/dashboards/{dash_id}/gaps/run")
async def gaps_run(dash_id: str, body: AIConfig, db=Depends(get_db)):
    d = _dash(db, dash_id)
    runner = _runner(body)
    run = _start(db, d, "gaps")
    entry = {"cancel": False}
    wire_ai.RUNS[run.id] = entry
    entry["task"] = asyncio.create_task(wire_ai.run_gaps(run.id, d.id, d.session_id, runner))
    return {"run_id": run.id}


@router.post("/dashboards/{dash_id}/runs/{run_id}/cancel")
def cancel(dash_id: str, run_id: int, db=Depends(get_db)):
    _dash(db, dash_id)
    if run_id in wire_ai.RUNS:
        wire_ai.RUNS[run_id]["cancel"] = True
    return {"ok": True}


@router.get("/dashboards/{dash_id}/agent")
def agent_state(dash_id: str, db=Depends(get_db)):
    d = _dash(db, dash_id)
    live_docs = {str(x.id) for x in db.query(Document).filter(Document.session_id == d.session_id).all()}
    live_claims = {n.node_id for n in db.query(CanvasNode).filter(CanvasNode.dashboard_id == d.id, CanvasNode.type == "claim").all()}
    sugg = []
    for s in db.query(WireSuggestion).filter(WireSuggestion.dashboard_id == d.id, WireSuggestion.status.in_(["pending", "accepted"])).all():
        ok = all((ref in live_docs) if kind == "paper" else (ref in live_claims)
                 for kind, ref in ((s.a_kind, s.a_ref), (s.b_kind, s.b_ref)))
        if ok:
            sugg.append(_sugg(s))
    runs = db.query(AgentRun).filter(AgentRun.dashboard_id == d.id).order_by(AgentRun.id.desc()).limit(12).all()
    for r in runs:                                      # a run whose task is gone died with the app
        if r.status == "running" and r.id not in wire_ai.RUNS:
            r.status, r.message = "failed", "Interrupted (the app was restarted)."
    db.commit()
    gaps = next((r for r in runs if r.kind == "gaps" and r.result), None)
    return {"suggestions": sugg, "runs": [_run(r) for r in runs],
            "gaps": _run(gaps, True) if gaps else None,
            "running": next((_run(r) for r in runs if r.status == "running"), None)}


class StatusIn(BaseModel):
    status: str


@router.patch("/wire/suggestions/{sid}")
def set_status(sid: int, body: StatusIn, db=Depends(get_db)):
    if body.status not in ("pending", "accepted", "dismissed"):
        raise HTTPException(status_code=422, detail="Unknown status")
    s = db.query(WireSuggestion).filter(WireSuggestion.id == sid).first()
    if not s:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    s.status = body.status
    db.commit()
    return _sugg(s)


class WireEstimateIn(BaseModel):
    document_ids: Optional[List[int]] = None
    include_claims: bool = True
    max_pairs: int = 12


@router.post("/dashboards/{dash_id}/wire/estimate")
def wire_estimate(dash_id: str, body: WireEstimateIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    q = db.query(Document).filter(Document.session_id == d.session_id, Document.status == DocStatus.COMPLETED)
    if body.document_ids:
        q = q.filter(Document.id.in_(body.document_ids))
    n_docs = q.count()
    claims = 0
    if body.include_claims:
        for n in db.query(CanvasNode).filter(CanvasNode.dashboard_id == d.id, CanvasNode.type == "claim").all():
            if len((json.loads(n.data or "{}").get("text") or "").strip()) >= 12:
                claims += 1
    done = db.query(WireSuggestion).filter(WireSuggestion.dashboard_id == d.id, WireSuggestion.a_kind == "paper").count()
    return {**wire_ai.estimate_wire(n_docs, claims, body.max_pairs, done), "papers": n_docs, "claims": claims}
