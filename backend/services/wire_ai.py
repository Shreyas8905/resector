"""Background agents for a dashboard: link suggestions between papers (and between your own claims
and papers) and gap finding for your claims. Nothing here changes the canvas: results are stored as
suggestions the user accepts or dismisses."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from langchain_core.messages import HumanMessage, SystemMessage

from ..database import (
    AgentRun, AiUsage, CanvasNode, Dashboard, SessionLocal, WireSuggestion, get_vector_collection,
)
from .dashboard_ai import LLMRunner, attach_pages, cite_record, completed_docs, retrieve
from .grounding import number_passages
from .wiring import (
    GAP_SYSTEM, JUDGE_SYSTEM, format_side, pair_key, parse_gap, parse_judgement, plan_pairs,
)

logger = logging.getLogger(__name__)

RUNS: Dict[int, Dict[str, Any]] = {}      # run_id -> {"cancel": bool, "task": asyncio.Task}
MAX_CLAIMS = 5
CLAIM_PAPERS = 3                          # papers checked per claim


class Cancelled(Exception):
    pass


# ---------------------------------------------------------------- vector helpers
def _where(session_id: str, doc_id: int) -> dict:
    return {"$and": [{"session_id": session_id}, {"document_id": doc_id}]}


def rep_text(session_id: str, doc_id: int) -> str:
    """Opening text of a paper (title/abstract area), used to find what it has in common with others."""
    try:
        res = get_vector_collection().get(where=_where(session_id, doc_id), limit=2)
        return " ".join(res.get("documents") or [])[:700]
    except Exception as e:
        logger.warning("rep_text failed for %s: %s", doc_id, e)
        return ""


def query_doc(session_id: str, doc_id: int, text: str, n: int) -> List[Tuple[str, float]]:
    if not text.strip():
        return []
    try:
        res = get_vector_collection().query(query_texts=[text], n_results=n, where=_where(session_id, doc_id))
    except Exception as e:
        logger.warning("query failed for %s: %s", doc_id, e)
        return []
    docs = (res.get("documents") or [[]])[0]
    dist = (res.get("distances") or [[0.0] * len(docs)])[0]
    return list(zip(docs, dist))


def score_pairs(session_id: str, ids: List[int], reps: Dict[int, str]) -> Dict[str, float]:
    scores: Dict[str, float] = {}
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            ds = [d for _, d in query_doc(session_id, b, reps.get(a, ""), 1)] + \
                 [d for _, d in query_doc(session_id, a, reps.get(b, ""), 1)]
            if ds:
                scores[pair_key("paper", a, "paper", b)] = min(ds)
    return scores


# ---------------------------------------------------------------- run bookkeeping
def _progress(db, run: AgentRun, **kw):
    for k, v in kw.items():
        setattr(run, k, v)
    db.commit()


def _check_cancel(run_id: int):
    if RUNS.get(run_id, {}).get("cancel"):
        raise Cancelled()


def _finish(db, run: AgentRun, status: str, message: str, runner: Optional[LLMRunner]):
    run.status, run.message, run.finished_at = status, message[:500], datetime.now(timezone.utc)
    if runner:
        run.tokens_in, run.tokens_out = runner.meter.tokens_in, runner.meter.tokens_out
        db.add(AiUsage(dashboard_id=run.dashboard_id, action=run.kind, provider=runner.config.provider,
                       model=runner.config.model_name, tokens_in=run.tokens_in, tokens_out=run.tokens_out,
                       estimated=1 if runner.meter.estimated else 0))
    db.commit()
    RUNS.pop(run.id, None)


# ---------------------------------------------------------------- wiring
async def _judge(runner: LLMRunner, a_label: str, a_name: str, a_pass: List[dict], b_label: str, b_name: str,
                 b_pass: List[dict], need_a: bool) -> Optional[Tuple[dict, List[dict]]]:
    ta, na = format_side(a_label, a_name, a_pass, 1)
    tb, nb = format_side(b_label, b_name, b_pass, 1 + len(a_pass))
    raw = await runner.run([SystemMessage(content=JUDGE_SYSTEM), HumanMessage(content=f"{ta}\n\n{tb}")])
    j = parse_judgement(raw, na, nb, need_a=need_a, need_b=True)
    if not j:
        return None
    by_n = {n: p for n, p in zip(na + nb, a_pass + b_pass)}
    cites = []
    for n in j["evidence"]:
        p = by_n[n]
        if p.get("kind") == "claim":
            continue
        cites.append(cite_record({**p, "n": n}))
    return j, cites


async def run_wire(run_id: int, dash_id: int, session_id: str, runner: LLMRunner,
                   doc_ids: Optional[List[int]], include_claims: bool, max_pairs: int, rerun: bool):
    db = SessionLocal()
    run = db.query(AgentRun).filter(AgentRun.id == run_id).first()
    try:
        docs = completed_docs(db, session_id, doc_ids or None)
        if len(docs) < 2 and not include_claims:
            return _finish(db, run, "failed", "Add at least two papers that have finished reading.", None)
        ids = sorted(docs)
        existing = db.query(WireSuggestion).filter(WireSuggestion.dashboard_id == dash_id).all()
        if rerun:
            for e in [x for x in existing if x.status == "none"]:
                db.delete(e)
            db.commit()
            existing = [x for x in existing if x.status != "none"]
        seen = {e.pair_key for e in existing}

        loop = asyncio.get_running_loop()
        reps = {d: await loop.run_in_executor(None, rep_text, session_id, d) for d in ids}
        scores = await loop.run_in_executor(None, score_pairs, session_id, ids, reps)
        pairs = plan_pairs([("paper", d) for d in ids], scores, seen, max_pairs)

        claims: List[Tuple[str, str]] = []
        if include_claims:
            for n in db.query(CanvasNode).filter(CanvasNode.dashboard_id == dash_id, CanvasNode.type == "claim").all():
                text = (json.loads(n.data or "{}").get("text") or "").strip()
                if len(text) >= 12:
                    claims.append((n.node_id, text))
            claims = claims[:MAX_CLAIMS]
        claim_jobs: List[Tuple[Tuple[str, str], int]] = []
        for node_id, text in claims:
            ranked: List[Tuple[float, int]] = []
            for d in ids:
                q = query_doc(session_id, d, text, 1)
                if q:
                    ranked.append((q[0][1], d))
            for _, d in sorted(ranked)[:CLAIM_PAPERS]:
                if pair_key("claim", node_id, "paper", d) not in seen:
                    claim_jobs.append(((node_id, text), d))

        _progress(db, run, total=len(pairs) + len(claim_jobs))
        if not pairs and not claim_jobs:
            return _finish(db, run, "done", "Nothing new to check: every pair has already been looked at.", runner)

        found = 0
        for a, b in pairs:
            _check_cancel(run_id)
            ra, rb = docs[a[1]], docs[b[1]]
            pa = [{"document_id": ra.id, "filename": ra.filename, "text": t} for t, _ in query_doc(session_id, ra.id, reps.get(rb.id, ""), 2)]
            pb = [{"document_id": rb.id, "filename": rb.filename, "text": t} for t, _ in query_doc(session_id, rb.id, reps.get(ra.id, ""), 2)]
            attach_pages(docs, pa + pb)
            key = pair_key("paper", ra.id, "paper", rb.id)
            res = await _judge(runner, "A", ra.filename, pa, "B", rb.filename, pb, True) if pa and pb else None
            if res:
                j, cites = res
                first, second = (ra.id, rb.id) if j["direction"] == "a_to_b" else (rb.id, ra.id)
                db.add(WireSuggestion(dashboard_id=dash_id, pair_key=key, a_kind="paper", a_ref=str(first),
                                      b_kind="paper", b_ref=str(second), relation=j["relation"], summary=j["summary"],
                                      evidence=json.dumps(cites), confidence=j["confidence"], status="pending", run_id=run_id))
                found += 1
            else:
                db.add(WireSuggestion(dashboard_id=dash_id, pair_key=key, a_kind="paper", a_ref=str(ra.id),
                                      b_kind="paper", b_ref=str(rb.id), status="none", run_id=run_id))
            run.done += 1
            run.found = found
            db.commit()

        for (node_id, text), d in claim_jobs:
            _check_cancel(run_id)
            rd = docs[d]
            pb = [{"document_id": rd.id, "filename": rd.filename, "text": t} for t, _ in query_doc(session_id, rd.id, text, 2)]
            attach_pages(docs, pb)
            key = pair_key("claim", node_id, "paper", rd.id)
            res = await _judge(runner, "A", "your claim", [{"text": text, "kind": "claim"}], "B", rd.filename, pb, False) if pb else None
            if res:
                j, cites = res
                db.add(WireSuggestion(dashboard_id=dash_id, pair_key=key, a_kind="claim", a_ref=node_id,
                                      b_kind="paper", b_ref=str(rd.id), relation=j["relation"], summary=j["summary"],
                                      evidence=json.dumps(cites), confidence=j["confidence"], status="pending", run_id=run_id))
                found += 1
            else:
                db.add(WireSuggestion(dashboard_id=dash_id, pair_key=key, a_kind="claim", a_ref=node_id,
                                      b_kind="paper", b_ref=str(rd.id), status="none", run_id=run_id))
            run.done += 1
            run.found = found
            db.commit()
        _finish(db, run, "done", f"Checked {run.total} pairs, suggested {found} links.", runner)
    except Cancelled:
        _finish(db, run, "cancelled", f"Stopped after {run.done} of {run.total} pairs. Suggestions found so far are kept.", runner)
    except Exception as e:
        logger.error("wire run failed: %s", e, exc_info=True)
        db.rollback()
        _finish(db, run, "failed", str(e)[:400], runner)
    finally:
        db.close()


# ---------------------------------------------------------------- gaps
async def run_gaps(run_id: int, dash_id: int, session_id: str, runner: LLMRunner):
    db = SessionLocal()
    run = db.query(AgentRun).filter(AgentRun.id == run_id).first()
    try:
        docs = completed_docs(db, session_id)
        claims = []
        for n in db.query(CanvasNode).filter(CanvasNode.dashboard_id == dash_id, CanvasNode.type == "claim").all():
            text = (json.loads(n.data or "{}").get("text") or "").strip()
            if len(text) >= 12:
                claims.append((n.node_id, text))
        claims = claims[:MAX_CLAIMS]
        if not docs or not claims:
            return _finish(db, run, "failed", "Add a “My research” card with your claim, and at least one finished paper.", None)
        _progress(db, run, total=len(claims))
        findings = []
        loop = asyncio.get_running_loop()
        for node_id, text in claims:
            _check_cancel(run_id)
            passages = await loop.run_in_executor(None, retrieve, session_id, docs, text, 8)
            attach_pages(docs, passages)
            context, included = number_passages(passages, int(runner.budget() * 0.6))
            parsed = None
            if included:
                raw = await runner.run([SystemMessage(content=GAP_SYSTEM),
                                        HumanMessage(content=f"CLAIM\n{text}\n\nPASSAGES\n{context}")])
                parsed = parse_gap(raw, [p["n"] for p in included])
            by_n = {p["n"]: p for p in included}
            if parsed:
                findings.append({"node_id": node_id, "claim": text, "verdict": parsed["verdict"],
                                 "missing": parsed["missing"], "search": parsed["search"],
                                 "supporting": [cite_record(by_n[n]) for n in parsed["supporting"]],
                                 "contradicting": [cite_record(by_n[n]) for n in parsed["contradicting"]]})
            else:
                findings.append({"node_id": node_id, "claim": text, "verdict": "not_covered",
                                 "missing": "The collection has nothing relevant to this claim." if not included else
                                            "The model's answer could not be read; try again.",
                                 "search": "", "supporting": [], "contradicting": []})
            run.done += 1
            run.result = json.dumps(findings)
            db.commit()
        _finish(db, run, "done", f"Checked {len(claims)} claim{'s' if len(claims) != 1 else ''}.", runner)
    except Cancelled:
        _finish(db, run, "cancelled", "Stopped.", runner)
    except Exception as e:
        logger.error("gap run failed: %s", e, exc_info=True)
        db.rollback()
        _finish(db, run, "failed", str(e)[:400], runner)
    finally:
        db.close()


# ---------------------------------------------------------------- estimate
def estimate_wire(n_docs: int, n_claims: int, max_pairs: int, already: int = 0) -> dict:
    pairs = max(0, min(max_pairs, n_docs * (n_docs - 1) // 2 - already))
    calls = pairs + min(n_claims, MAX_CLAIMS) * CLAIM_PAPERS
    return {"calls": calls, "tokens_in": calls * 1500, "tokens_out": calls * 140}
