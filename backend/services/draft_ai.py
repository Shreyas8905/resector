"""AI actions for drafts: source suggestions (no model call), outline and section writing for autopilot,
and the draft checker. Everything is grounded in the dashboard's own papers and saved excerpts."""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from ..database import AgentRun, CanvasEdge, CanvasNode, Document, Draft, Excerpt, SessionLocal
from .dashboard_ai import (
    LLMRunner, attach_pages, cite_record, completed_docs, get_pages, retrieve,
)
from .drafts import (
    best_window, content_hash, doc_marker, excerpt_marker, marker_for_passage, overlap_score, parse_check,
    parse_key, parse_outline, plan_check, split_sentences, to_markers,
)
from .grounding import number_passages
from .token_budget import estimate_tokens, truncate_text
from .wire_ai import RUNS, Cancelled, _check_cancel, _finish, _progress, query_doc

logger = logging.getLogger(__name__)

CHECK_BATCH = 3
SOURCE_CHARS = 900


# ---------------------------------------------------------------- canvas context
def describe_links(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]],
                   filenames: Dict[int, str], limit: int = 25) -> List[str]:
    """Plain-language lines for the links the author drew, e.g. '"A.pdf" supports "my claim: ..."'."""
    by_id = {n["node_id"]: n for n in nodes}

    def name(n: Dict[str, Any]) -> str:
        data, t = n.get("data") or {}, n.get("type")
        if t == "paper":
            return filenames.get(data.get("document_id"), "a paper")
        if t == "claim":
            return "my claim: " + (data.get("text") or "")[:70]
        if t == "excerpt":
            return "a saved quote"
        return (data.get("title") or data.get("text") or t or "note")[:50]

    out = []
    for e in edges:
        a, b = by_id.get(e["source"]), by_id.get(e["target"])
        if not a or not b:
            continue
        kind = (e.get("kind") or "related").replace("_", " ")
        label = f" ({e['label'].strip()})" if (e.get("label") or "").strip() else ""
        out.append(f'"{name(a)}" {kind} "{name(b)}"{label}')
        if len(out) >= limit:
            break
    return out


def canvas_context(db, dash_id: int, filenames: Dict[int, str]) -> Dict[str, Any]:
    nodes = []
    claims: List[str] = []
    for n in db.query(CanvasNode).filter(CanvasNode.dashboard_id == dash_id).all():
        data = json.loads(n.data or "{}")
        nodes.append({"node_id": n.node_id, "type": n.type, "data": data})
        if n.type == "claim" and len((data.get("text") or "").strip()) >= 12:
            claims.append(data["text"].strip()[:400])
    edges = [{"source": e.source, "target": e.target, "kind": e.kind, "label": e.label}
             for e in db.query(CanvasEdge).filter(CanvasEdge.dashboard_id == dash_id).all()]
    return {"claims": claims[:8], "links": describe_links(nodes, edges, filenames)}


# ---------------------------------------------------------------- suggestions (free: no model call)
def suggest_sources(db, session_id: str, dash_id: int, text: str, doc_ids: Optional[List[int]], k: int = 6) -> List[Dict[str, Any]]:
    text = (text or "").strip()
    if not text:
        return []
    docs = completed_docs(db, session_id, doc_ids or None)
    if not docs:
        return []
    out: List[Dict[str, Any]] = []
    scored = []
    for ex in db.query(Excerpt).filter(Excerpt.dashboard_id == dash_id, Excerpt.document_id.in_(list(docs))).all():
        if ex.quote:
            sc = overlap_score(text, ex.quote)
            if sc >= 0.12:
                scored.append((sc, ex))
    scored.sort(key=lambda x: -x[0])
    for sc, ex in scored[:3]:
        out.append({"marker": excerpt_marker(ex.id), "kind": "excerpt", "document_id": ex.document_id,
                    "filename": docs[ex.document_id].filename, "page": ex.page,
                    "quote": re.sub(r"\s+", " ", ex.quote).strip()[:320]})
    passages = retrieve(session_id, docs, text, k)
    attach_pages(docs, passages)
    for p in passages:
        q = re.sub(r"\s+", " ", p["text"]).strip()
        if any(overlap_score(q, o["quote"]) > 0.8 for o in out):
            continue
        out.append({"marker": doc_marker(p["document_id"], p.get("page")), "kind": "passage",
                    "document_id": p["document_id"], "filename": p["filename"], "page": p.get("page"), "quote": q[:320]})
        if len(out) >= k:
            break
    return out


# ---------------------------------------------------------------- autopilot
OUTLINE_SYSTEM = (
    "You plan a section-by-section outline for a piece of academic writing, based on what the author's "
    "research collection actually contains. Return JSON only: "
    '{"sections":[{"heading":"...","goal":"one sentence on what this section should establish"}]}. '
    "3 to 8 sections. Use the author's own claims and the links they drew to decide the structure. "
    "Do not invent topics the papers do not cover."
)

SECTION_SYSTEM = (
    "You write ONE section of a research draft for its author, using ONLY the numbered passages provided.\n"
    "- Write clear academic prose with no heading, at most {words} words.\n"
    "- Cite every factual claim with its passage number in square brackets, like [1] or [2][3]. Never cite a "
    "number that is not listed. Never invent facts, numbers, authors or years.\n"
    "- If the passages cannot support part of the goal, write only what they do support, then end with one line "
    "starting 'TODO:' that says what is missing.\n"
    "- AUTHOR'S POSITION shows what the author argues. Use it to frame the section. It is not evidence: do not cite it.\n"
    "- Do not repeat what the draft already says."
)


def estimate_autopilot(sections: int, budget: int, words: int = 220) -> Dict[str, int]:
    n = max(1, sections)
    return {"tokens_in": int(budget * 0.75) * n + 900, "tokens_out": int(words * 1.7) * n + 300}


async def make_outline(db, runner: LLMRunner, session_id: str, dash_id: int, instruction: str,
                       doc_ids: Optional[List[int]]) -> List[Dict[str, str]]:
    docs = completed_docs(db, session_id, doc_ids or None)
    if not docs:
        raise ValueError("Add a paper to this dashboard and wait for it to finish reading first.")
    ctx = canvas_context(db, dash_id, {d.id: d.filename for d in docs.values()})
    lines = ["PAPERS", *[f"- {d.filename}" for d in docs.values()][:30]]
    if ctx["claims"]:
        lines += ["", "AUTHOR'S CLAIMS", *[f"- {c}" for c in ctx["claims"]]]
    if ctx["links"]:
        lines += ["", "LINKS THE AUTHOR DREW", *[f"- {x}" for x in ctx["links"]]]
    lines += ["", "WHAT THE AUTHOR WANTS TO WRITE", instruction.strip() or "A literature review of these papers"]
    body = truncate_text("\n".join(lines), int(runner.budget() * 0.7))
    raw = await runner.run([SystemMessage(content=OUTLINE_SYSTEM), HumanMessage(content=body)])
    sections = parse_outline(raw)
    if not sections:
        raise ValueError("The model's outline could not be read. Try again, or write your own section titles.")
    return sections


async def write_section(db, runner: LLMRunner, session_id: str, dash_id: int, heading: str, goal: str,
                        instruction: str, doc_ids: Optional[List[int]], draft_text: str, words: int = 220) -> Dict[str, Any]:
    docs = completed_docs(db, session_id, doc_ids or None)
    if not docs:
        raise ValueError("Add a paper to this dashboard and wait for it to finish reading first.")
    words = max(80, min(int(words or 220), 500))
    query = " ".join(x for x in (heading, goal, instruction) if x).strip()
    budget = runner.budget()

    passages: List[Dict[str, Any]] = []
    scored = []
    for ex in db.query(Excerpt).filter(Excerpt.dashboard_id == dash_id, Excerpt.document_id.in_(list(docs))).all():
        if ex.quote:
            scored.append((overlap_score(query, ex.quote), ex))
    scored.sort(key=lambda x: -x[0])
    for sc, ex in scored[:6]:
        if sc >= 0.08:
            passages.append({"document_id": ex.document_id, "filename": docs[ex.document_id].filename, "page": ex.page,
                             "text": ex.quote, "rects": json.loads(ex.rects or "[]"), "excerpt_id": ex.id, "kind": "excerpt"})
    k = max(4, min(12, budget // 650))
    loop = asyncio.get_running_loop()
    got = await loop.run_in_executor(None, retrieve, session_id, docs, query, k)
    attach_pages(docs, got)
    seen = {p["text"][:80] for p in passages}
    passages += [p for p in got if p["text"][:80] not in seen]
    context, included = number_passages(passages, int(budget * 0.55))
    if not included:
        raise ValueError("I could not find anything relevant in your papers for this section.")

    ctx = canvas_context(db, dash_id, {d.id: d.filename for d in docs.values()})
    parts = [f"PASSAGES\n{context}"]
    if ctx["claims"]:
        parts.append("AUTHOR'S POSITION\n" + "\n".join(f"- {c}" for c in ctx["claims"][:5]))
    prior = re.sub(r"\[@[^\]]+\]", "", draft_text or "").strip()
    if prior:
        parts.append("DRAFT SO FAR (do not repeat)\n" + truncate_text(prior, int(budget * 0.12), keep_tail=0.8))
    task = f"SECTION: {heading}" + (f"\nGOAL: {goal}" if goal else "") + (f"\nNOTES FROM THE AUTHOR: {instruction}" if instruction else "")
    parts.append(task)
    raw = await runner.run([SystemMessage(content=SECTION_SYSTEM.format(words=words)),
                            HumanMessage(content="\n\n".join(parts))])
    text, used = to_markers(raw, included)
    by_marker = {}
    for p in included:
        by_marker.setdefault(marker_for_passage(p), p)
    cites = []
    for mk in used:
        p = by_marker.get(mk)
        if p:
            rec = cite_record(p)
            rec["marker"] = mk
            cites.append(rec)
    return {"text": text, "cites": cites, "uncited": not used, "usage": runner.meter.as_dict()}


# ---------------------------------------------------------------- draft checker
CHECK_SYSTEM = (
    "You check whether sentences in a researcher's draft are backed by the source passages shown under each one. "
    "For each item give a verdict:\n"
    "- supported: a passage states what the sentence says\n"
    "- partial: related, but the passage is narrower, weaker, or covers only part of the sentence\n"
    "- unsupported: the passages do not say it\n"
    "- contradicted: a passage says the opposite\n"
    "Judge ONLY from the passages shown. When several sources are shown and one fits best, give its number as "
    '"source". Return JSON only: {"items":[{"id":1,"verdict":"supported","source":1,"reason":"at most 25 words"}]}'
)


def _clip(text: str, n: int = 320) -> str:
    return re.sub(r"\s+", " ", text or "").strip()[:n]


def _sources_for_item(session_id: str, docs: Dict[int, Document], item: Dict[str, Any],
                      excerpts: Dict[int, Excerpt]) -> List[Dict[str, Any]]:
    """Source texts the sentence cites (or, for an uncited claim, the best candidates in the collection)."""
    out: List[Dict[str, Any]] = []
    if item["keys"]:
        for key in item["keys"]:
            k = parse_key(key)
            if not k:
                continue
            if k["kind"] == "excerpt":
                ex = excerpts.get(k["id"])
                d = docs.get(ex.document_id) if ex else None
                if not ex or not d:
                    continue
                out.append({"marker": excerpt_marker(ex.id), "filename": d.filename, "page": ex.page,
                            "text": ex.quote or "(a figure or area selection with no text)"})
            else:
                d = docs.get(k["id"])
                if not d or not d.file_path or not os.path.exists(d.file_path):
                    continue
                if k["page"]:
                    try:
                        pages = get_pages(d.file_path)
                    except Exception:
                        continue
                    if 1 <= k["page"] <= len(pages):
                        out.append({"marker": doc_marker(d.id, k["page"]), "filename": d.filename, "page": k["page"],
                                    "text": best_window(pages[k["page"] - 1], item["text"], SOURCE_CHARS)})
                else:
                    for t, _ in query_doc(session_id, d.id, item["text"], 2):
                        out.append({"marker": doc_marker(d.id), "filename": d.filename, "page": None, "text": t})
        return out[:3]
    cands = retrieve(session_id, docs, item["text"], 4)[:2]
    attach_pages(docs, cands)
    return [{"marker": doc_marker(p["document_id"], p.get("page")), "filename": p["filename"], "page": p.get("page"),
             "text": _clip(p["text"], SOURCE_CHARS)} for p in cands]


def _item_block(i: int, sentence: str, sources: List[Dict[str, Any]]) -> str:
    lines = [f"ITEM {i}", f"Sentence: {sentence}"]
    for n, s in enumerate(sources, 1):
        where = f" p.{s['page']}" if s.get("page") else ""
        lines.append(f"Source {n} ({s['filename']}{where}): {_clip(s['text'], SOURCE_CHARS)}")
    return "\n".join(lines)


def estimate_check(content: str) -> Dict[str, int]:
    items, skipped = plan_check(split_sentences(content))
    calls = math.ceil(len(items) / CHECK_BATCH) if items else 0
    return {"items": len(items), "skipped": skipped, "calls": calls,
            "tokens_in": calls * (CHECK_BATCH * 330 + 350), "tokens_out": calls * CHECK_BATCH * 60}


async def run_check(run_id: int, dash_id: int, session_id: str, draft_id: int, runner: LLMRunner):
    db = SessionLocal()
    run = db.query(AgentRun).filter(AgentRun.id == run_id).first()
    try:
        draft = db.query(Draft).filter(Draft.id == draft_id, Draft.dashboard_id == dash_id).first()
        if not draft:
            return _finish(db, run, "failed", "Draft not found.", None)
        content = draft.content or ""
        items, skipped = plan_check(split_sentences(content))
        docs = completed_docs(db, session_id)
        if not items:
            run.result = json.dumps({"draft_id": draft_id, "hash": content_hash(content), "findings": [], "skipped": 0})
            return _finish(db, run, "done", "Nothing to check yet: add some sentences with claims or citations.", None)
        if not docs:
            return _finish(db, run, "failed", "Add a finished paper to this dashboard first.", None)
        excerpts = {e.id: e for e in db.query(Excerpt).filter(Excerpt.dashboard_id == dash_id).all()}
        _progress(db, run, total=len(items))
        loop = asyncio.get_running_loop()
        findings: List[Dict[str, Any]] = []

        def save():
            counts: Dict[str, int] = {}
            for f in findings:
                counts[f["verdict"]] = counts.get(f["verdict"], 0) + 1
            run.result = json.dumps({"draft_id": draft_id, "hash": content_hash(content), "findings": findings,
                                     "skipped": skipped, "counts": counts})
            run.found = sum(1 for f in findings if f["verdict"] in ("unsupported", "contradicted", "partial"))
            db.commit()

        pending: List[Dict[str, Any]] = []     # items with sources, waiting for a model call
        budget_chars = int(runner.budget() * 0.6 * 3.2)

        async def flush():
            if not pending:
                return
            block = "\n\n".join(_item_block(j + 1, it["text"], it["sources"]) for j, it in enumerate(pending))
            raw = await runner.run([SystemMessage(content=CHECK_SYSTEM), HumanMessage(content=block)])
            ids = list(range(1, len(pending) + 1))
            parsed = parse_check(raw, ids, {j + 1: len(it["sources"]) for j, it in enumerate(pending)})
            for j, it in enumerate(pending, 1):
                res = parsed.get(j)
                if res:
                    src_n = res["source"]
                    suggest = None
                    if not it["keys"] and res["verdict"] in ("supported", "partial"):
                        pick = src_n or 1
                        suggest = it["sources"][pick - 1]["marker"] if pick <= len(it["sources"]) else None
                    verdict, reason = res["verdict"], res["reason"]
                else:
                    suggest, verdict, reason = None, "unchecked", "The model's answer could not be read for this sentence."
                findings.append({
                    "idx": it["idx"], "raw": it["raw"], "sentence": it["text"], "section": it["section"],
                    "cited": bool(it["keys"]), "verdict": verdict, "reason": reason, "suggest": suggest,
                    "sources": [{"marker": s["marker"], "filename": s["filename"], "page": s["page"], "quote": _clip(s["text"])}
                                for s in it["sources"]]})
            run.done += len(pending)
            pending.clear()
            save()

        for it in items:
            _check_cancel(run_id)
            srcs = await loop.run_in_executor(None, _sources_for_item, session_id, docs, it, excerpts)
            if not srcs:
                findings.append({"idx": it["idx"], "raw": it["raw"], "sentence": it["text"], "section": it["section"],
                                 "cited": bool(it["keys"]), "sources": [], "suggest": None,
                                 "verdict": "unsupported" if not it["keys"] else "unchecked",
                                 "reason": "Nothing in your papers matches this sentence." if not it["keys"]
                                           else "The cited source could not be found (it may have been deleted)."})
                run.done += 1
                save()
                continue
            it = {**it, "sources": srcs}
            size = sum(len(_item_block(0, x["text"], x["sources"])) for x in pending) + len(_item_block(0, it["text"], srcs))
            if pending and (len(pending) >= CHECK_BATCH or size > budget_chars):
                await flush()
                _check_cancel(run_id)
            pending.append(it)
        await flush()
        findings.sort(key=lambda f: f["idx"])
        save()
        bad = sum(1 for f in findings if f["verdict"] in ("unsupported", "contradicted"))
        _finish(db, run, "done", f"Checked {len(findings)} sentences, {bad} need attention.", runner)
    except Cancelled:
        _finish(db, run, "cancelled", f"Stopped after {run.done} of {run.total} sentences.", runner)
    except Exception as e:
        logger.error("draft check failed: %s", e, exc_info=True)
        db.rollback()
        _finish(db, run, "failed", str(e)[:400], runner)
    finally:
        db.close()
