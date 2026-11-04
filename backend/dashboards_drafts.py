"""Stage 4 API: drafts with cite-while-writing, version history, the draft checker, autopilot, exports."""
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from .dashboards import _dash, _touch, get_db
from .dashboards_ai import AIConfig, _record, _runner, _wrap
from .dashboards_wire import _run, _start
from .database import AgentRun, Document, Draft, DraftVersion, Excerpt
from .provider_factory import ProviderConfig
from .services import draft_ai, drafts as dr, wire_ai
from .services.dashboard_utils import clean_text
from .services.token_budget import input_budget

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_CONTENT = 400_000


def _draft(db, d, draft_id: int) -> Draft:
    x = db.query(Draft).filter(Draft.id == draft_id, Draft.dashboard_id == d.id).first()
    if not x:
        raise HTTPException(status_code=404, detail="Draft not found")
    return x


def _summary(x: Draft) -> dict:
    return {"id": x.id, "title": x.title, "updated_at": x.updated_at, "words": dr.word_count(x.content or "")}


def _full(x: Draft) -> dict:
    return {**_summary(x), "content": x.content or "", "created_at": x.created_at}


def _version(v: DraftVersion, with_content: bool = False) -> dict:
    out = {"id": v.id, "label": v.label or "", "kind": v.kind, "created_at": v.created_at,
           "chars": len(v.content or ""), "words": dr.word_count(v.content or "")}
    if with_content:
        out["content"] = v.content or ""
    return out


def _snapshot(db, x: Draft, kind: str, label: str = "") -> DraftVersion:
    v = DraftVersion(draft_id=x.id, kind=kind, label=label[:80], content=x.content or "")
    db.add(v)
    db.flush()
    rows = [{"id": r.id, "kind": r.kind} for r in db.query(DraftVersion).filter(DraftVersion.draft_id == x.id).all()]
    gone = dr.versions_to_prune(rows)
    if gone:
        db.query(DraftVersion).filter(DraftVersion.id.in_(gone)).delete(synchronize_session=False)
    return v


def _seconds_since_last_version(db, x: Draft) -> float:
    last = db.query(DraftVersion).filter(DraftVersion.draft_id == x.id).order_by(DraftVersion.id.desc()).first()
    ts = last.created_at if last else x.created_at
    if ts is None:
        return 1e9
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ts).total_seconds()


# ---------------------------------------------------------------- CRUD
@router.get("/dashboards/{dash_id}/drafts")
def list_drafts(dash_id: str, db=Depends(get_db)):
    d = _dash(db, dash_id)
    rows = db.query(Draft).filter(Draft.dashboard_id == d.id).order_by(Draft.updated_at.desc()).all()
    return [_summary(x) for x in rows]


class DraftIn(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


@router.post("/dashboards/{dash_id}/drafts")
def create_draft(dash_id: str, body: DraftIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    x = Draft(dashboard_id=d.id, title=clean_text(body.title or "", 120) or "Untitled draft", content=(body.content or "")[:MAX_CONTENT])
    db.add(x)
    _touch(d)
    db.commit()
    return _full(x)


@router.get("/dashboards/{dash_id}/drafts/{draft_id}")
def get_draft(dash_id: str, draft_id: int, db=Depends(get_db)):
    return _full(_draft(db, _dash(db, dash_id), draft_id))


class DraftSave(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    snapshot: Optional[str] = None      # keep the CURRENT text as a version first, with this label (autopilot)


@router.put("/dashboards/{dash_id}/drafts/{draft_id}")
def save_draft(dash_id: str, draft_id: int, body: DraftSave, db=Depends(get_db)):
    d = _dash(db, dash_id)
    x = _draft(db, d, draft_id)
    if body.title is not None:
        x.title = clean_text(body.title, 120) or "Untitled draft"
    if body.content is not None:
        new = body.content[:MAX_CONTENT]
        old = x.content or ""
        if body.snapshot is not None and old.strip() and old != new:
            _snapshot(db, x, "autopilot", body.snapshot or "Before autopilot")
        elif dr.should_auto_snapshot(old, new, _seconds_since_last_version(db, x)):
            _snapshot(db, x, "auto", "Automatic")
        x.content = new
    x.updated_at = datetime.now(timezone.utc)
    _touch(d)
    db.commit()
    return {"id": x.id, "updated_at": x.updated_at, "words": dr.word_count(x.content or "")}


@router.delete("/dashboards/{dash_id}/drafts/{draft_id}")
def delete_draft(dash_id: str, draft_id: int, db=Depends(get_db)):
    d = _dash(db, dash_id)
    x = _draft(db, d, draft_id)
    db.query(DraftVersion).filter(DraftVersion.draft_id == x.id).delete()
    db.delete(x)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- versions
@router.get("/dashboards/{dash_id}/drafts/{draft_id}/versions")
def list_versions(dash_id: str, draft_id: int, db=Depends(get_db)):
    x = _draft(db, _dash(db, dash_id), draft_id)
    rows = db.query(DraftVersion).filter(DraftVersion.draft_id == x.id).order_by(DraftVersion.id.desc()).all()
    return [_version(v) for v in rows]


@router.get("/dashboards/{dash_id}/drafts/{draft_id}/versions/{vid}")
def get_version(dash_id: str, draft_id: int, vid: int, db=Depends(get_db)):
    x = _draft(db, _dash(db, dash_id), draft_id)
    v = db.query(DraftVersion).filter(DraftVersion.id == vid, DraftVersion.draft_id == x.id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    return _version(v, True)


class VersionIn(BaseModel):
    label: str = ""


@router.post("/dashboards/{dash_id}/drafts/{draft_id}/versions")
def save_version(dash_id: str, draft_id: int, body: VersionIn, db=Depends(get_db)):
    x = _draft(db, _dash(db, dash_id), draft_id)
    v = _snapshot(db, x, "manual", clean_text(body.label, 80) or "Saved version")
    db.commit()
    return _version(v)


@router.post("/dashboards/{dash_id}/drafts/{draft_id}/versions/{vid}/restore")
def restore_version(dash_id: str, draft_id: int, vid: int, db=Depends(get_db)):
    d = _dash(db, dash_id)
    x = _draft(db, d, draft_id)
    v = db.query(DraftVersion).filter(DraftVersion.id == vid, DraftVersion.draft_id == x.id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    if (x.content or "").strip() and x.content != v.content:
        _snapshot(db, x, "restore", "Before restoring an earlier version")
    x.content = v.content
    x.updated_at = datetime.now(timezone.utc)
    _touch(d)
    db.commit()
    return _full(x)


@router.delete("/dashboards/{dash_id}/drafts/{draft_id}/versions/{vid}")
def delete_version(dash_id: str, draft_id: int, vid: int, db=Depends(get_db)):
    x = _draft(db, _dash(db, dash_id), draft_id)
    db.query(DraftVersion).filter(DraftVersion.id == vid, DraftVersion.draft_id == x.id).delete()
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- cite while writing
class SuggestIn(BaseModel):
    text: str
    document_ids: Optional[List[int]] = None
    k: int = 6


@router.post("/dashboards/{dash_id}/drafts/suggest")
async def suggest(dash_id: str, body: SuggestIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    text = clean_text(body.text, 1500)
    if len(text) < 8:
        raise HTTPException(status_code=422, detail="Select or write a sentence first.")
    loop = asyncio.get_running_loop()
    try:
        items = await loop.run_in_executor(None, draft_ai.suggest_sources, db, d.session_id, d.id, text,
                                           body.document_ids, max(1, min(body.k, 10)))
    except Exception as e:
        raise _wrap(e)
    return {"sources": items}      # retrieval only: costs no model tokens


# ---------------------------------------------------------------- autopilot
class OutlineIn(AIConfig):
    instruction: str = ""
    document_ids: Optional[List[int]] = None
    context_draft_ids: Optional[List[int]] = None       # the author's other drafts, for consistency


@router.post("/dashboards/{dash_id}/drafts/autopilot/outline")
async def autopilot_outline(dash_id: str, body: OutlineIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    runner = _runner(body)
    try:
        sections = await draft_ai.make_outline(db, runner, d.session_id, d.id, clean_text(body.instruction, 1200), body.document_ids, body.context_draft_ids)
        _record(db, d, "draft_outline", runner)
        return {"sections": sections, "usage": runner.meter.as_dict()}
    except Exception as e:
        raise _wrap(e)


class SectionIn(AIConfig):
    heading: str
    goal: str = ""
    instruction: str = ""
    document_ids: Optional[List[int]] = None
    draft_text: str = ""
    words: int = 220
    context_draft_ids: Optional[List[int]] = None


@router.post("/dashboards/{dash_id}/drafts/autopilot/section")
async def autopilot_section(dash_id: str, body: SectionIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    heading = clean_text(body.heading, 120)
    if not heading:
        raise HTTPException(status_code=422, detail="Give the section a title.")
    runner = _runner(body)
    try:
        res = await draft_ai.write_section(db, runner, d.session_id, d.id, heading, clean_text(body.goal, 300),
                                           clean_text(body.instruction, 800), body.document_ids, body.draft_text[-20000:], body.words, body.context_draft_ids)
        _record(db, d, "draft_section", runner)
        return res
    except Exception as e:
        raise _wrap(e)


class AutopilotEstimateIn(BaseModel):
    sections: int = 5
    words: int = 220
    provider: str = "groq"
    model_name: Optional[str] = None


@router.post("/dashboards/{dash_id}/drafts/autopilot/estimate")
def autopilot_estimate(dash_id: str, body: AutopilotEstimateIn, db=Depends(get_db)):
    _dash(db, dash_id)
    cfg = ProviderConfig(provider=body.provider, api_key="x", model_name=body.model_name)
    return draft_ai.estimate_autopilot(body.sections, input_budget(cfg.provider, cfg.model_name), body.words)


# ---------------------------------------------------------------- checker
def _check_runs(db, d, draft_id: int):
    rows = db.query(AgentRun).filter(AgentRun.dashboard_id == d.id, AgentRun.kind == "check").order_by(AgentRun.id.desc()).limit(30).all()
    for r in rows:
        if r.status == "running" and r.id not in wire_ai.RUNS:
            r.status, r.message = "failed", "Interrupted (the app was restarted)."
    db.commit()
    mine = []
    for r in rows:
        try:
            did = json.loads(r.result).get("draft_id") if r.result else None
        except ValueError:
            did = None
        if did == draft_id or (did is None and r.status == "running" and (r.message or "") == f"draft:{draft_id}"):
            mine.append(r)
    return mine


@router.post("/dashboards/{dash_id}/drafts/{draft_id}/check/run")
async def check_run(dash_id: str, draft_id: int, body: AIConfig, db=Depends(get_db)):
    d = _dash(db, dash_id)
    x = _draft(db, d, draft_id)
    if not (x.content or "").strip():
        raise HTTPException(status_code=422, detail="Write something first.")
    runner = _runner(body)
    run = _start(db, d, "check")
    run.message = f"draft:{x.id}"
    run.result = json.dumps({"draft_id": x.id, "hash": dr.content_hash(x.content or ""), "findings": [], "skipped": 0})
    db.commit()
    entry = {"cancel": False}
    wire_ai.RUNS[run.id] = entry
    entry["task"] = asyncio.create_task(draft_ai.run_check(run.id, d.id, d.session_id, x.id, runner))
    return {"run_id": run.id}


@router.get("/dashboards/{dash_id}/drafts/{draft_id}/check")
def check_state(dash_id: str, draft_id: int, db=Depends(get_db)):
    d = _dash(db, dash_id)
    x = _draft(db, d, draft_id)
    runs = _check_runs(db, d, x.id)
    latest = runs[0] if runs else None
    if not latest:
        return {"run": None, "result": None, "current_hash": dr.content_hash(x.content or "")}
    result = json.loads(latest.result) if latest.result else None
    return {"run": _run(latest), "result": result, "current_hash": dr.content_hash(x.content or "")}


@router.get("/dashboards/{dash_id}/drafts/{draft_id}/check/estimate")
def check_estimate(dash_id: str, draft_id: int, db=Depends(get_db)):
    x = _draft(db, _dash(db, dash_id), draft_id)
    return draft_ai.estimate_check(x.content or "")


# ---------------------------------------------------------------- export
def _resolver(db, d):
    docs = {x.id: x for x in db.query(Document).filter(Document.session_id == d.session_id).all()}
    excerpts = {e.id: e for e in db.query(Excerpt).filter(Excerpt.dashboard_id == d.id).all()}

    def resolve(key: str):
        k = dr.parse_key(key)
        if not k:
            return None
        if k["kind"] == "excerpt":
            ex = excerpts.get(k["id"])
            doc = docs.get(ex.document_id) if ex else None
            if not ex or not doc:
                return None
            return {"filename": doc.filename, "page": ex.page, "quote": ex.quote or "", "document_id": doc.id}
        doc = docs.get(k["id"])
        if not doc:
            return None
        return {"filename": doc.filename, "page": k["page"], "quote": "", "document_id": doc.id}

    return resolve


def _safe_name(title: str) -> str:
    s = "".join(c if c.isalnum() or c in " -_" else "" for c in title).strip().replace(" ", "_")
    return (s or "draft")[:60]


@router.get("/dashboards/{dash_id}/drafts/{draft_id}/export")
def export_draft(dash_id: str, draft_id: int, format: str = "md", quotes: bool = True, db=Depends(get_db)):
    d = _dash(db, dash_id)
    x = _draft(db, d, draft_id)
    resolve = _resolver(db, d)
    if format == "html":
        body, missing = dr.build_html(x.title, x.content or "", resolve, quotes)
        mime, ext = "text/html; charset=utf-8", "html"
    elif format == "md":
        body, missing = dr.build_markdown(x.title, x.content or "", resolve, quotes)
        mime, ext = "text/markdown; charset=utf-8", "md"
    else:
        raise HTTPException(status_code=422, detail="Unknown format")
    return Response(content=body, media_type=mime, headers={
        "Content-Disposition": f'attachment; filename="{_safe_name(x.title)}.{ext}"',
        "X-Missing-Sources": str(len(missing)),
        "Access-Control-Expose-Headers": "X-Missing-Sources, Content-Disposition"})
