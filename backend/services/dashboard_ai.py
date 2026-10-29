"""AI actions on a dashboard: grounded Q&A, per-paper summary, comparison rows, passage locating.
Every action goes through LLMRunner, which keeps requests inside the provider's token limit and
records usage for the cost meter."""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
from typing import Any, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from ..config import RateLimitError, settings
from ..database import ChatMessage, Document, DocStatus, Excerpt, MessageRole, get_vector_collection
from ..provider_factory import ProviderConfig, ProviderFactory
from .grounding import (
    clean_table_cells, extract_json_object, find_page, normalize_citations, normalize_page_cites,
    number_passages, snippet_candidates,
)
from .token_budget import (
    estimate_tokens, fit_messages, input_budget, is_too_large_error, learn_from_error,
    retry_after_seconds, split_for_condense, truncate_text,
)

logger = logging.getLogger(__name__)

DEFAULT_COLUMNS = ["Research question", "Method", "Data", "Key result", "Limitations"]


# ---------------------------------------------------------------- LLM runner
class Meter:
    def __init__(self):
        self.tokens_in = 0
        self.tokens_out = 0
        self.calls = 0
        self.estimated = False

    def add(self, resp: Any, sent: List[Any], text: str):
        self.calls += 1
        usage = getattr(resp, "usage_metadata", None) or {}
        tin, tout = usage.get("input_tokens"), usage.get("output_tokens")
        if tin is None or tout is None:
            self.estimated = True
            tin = sum(estimate_tokens(getattr(m, "content", "")) for m in sent)
            tout = estimate_tokens(text)
        self.tokens_in += int(tin)
        self.tokens_out += int(tout)

    def as_dict(self) -> dict:
        return {"tokens_in": self.tokens_in, "tokens_out": self.tokens_out, "calls": self.calls,
                "estimated": self.estimated}


def content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(b if isinstance(b, str) else b.get("text", "")
                       for b in content if isinstance(b, str) or (isinstance(b, dict) and b.get("type") == "text"))
    return str(content or "")


class LLMRunner:
    def __init__(self, config: ProviderConfig):
        self.config = config
        self.llm = ProviderFactory.get_llm(config)
        self.shrink = 1.0
        self.meter = Meter()

    def budget(self) -> int:
        return input_budget(self.config.provider, self.config.model_name, self.shrink)

    async def run(self, messages: List[Any]) -> str:
        last: Optional[Exception] = None
        for attempt in range(6):
            sent = fit_messages(messages, self.budget())
            try:
                resp = await self.llm.ainvoke(sent)
                text = content_to_text(resp.content)
                self.meter.add(resp, sent, text)
                return text
            except Exception as e:
                last = e
                msg = str(e).lower()
                if is_too_large_error(e):
                    learn_from_error(self.config.provider, self.config.model_name, str(e))
                    self.shrink *= 0.75
                    if self.budget() <= 800:
                        raise
                    continue
                if "rate limit" in msg or "429" in msg or "too many requests" in msg or "tokens per minute" in msg \
                        or "timeout" in msg or "503" in msg or "502" in msg:
                    await asyncio.sleep(retry_after_seconds(e, default=min(2 ** (attempt + 1), 20)))
                    continue
                raise
        raise RateLimitError(f"The model provider kept refusing the request: {str(last)[:300]}")


# ---------------------------------------------------------------- PDF text access
_PAGES_CACHE: Dict[str, tuple] = {}


def get_pages(file_path: str) -> List[str]:
    """Text of every page (cached while the file is unchanged)."""
    import pymupdf
    mtime = os.path.getmtime(file_path)
    hit = _PAGES_CACHE.get(file_path)
    if hit and hit[0] == mtime:
        return hit[1]
    with pymupdf.open(file_path) as pdf:
        pages = [p.get_text() for p in pdf]
    if len(_PAGES_CACHE) >= 8:
        _PAGES_CACHE.pop(next(iter(_PAGES_CACHE)))
    _PAGES_CACHE[file_path] = (mtime, pages)
    return pages


def locate_rects(file_path: str, page_no: int, quote: str, max_rects: int = 12) -> List[List[float]]:
    """Highlight rectangles (fractions of the page) for the start/middle of a passage."""
    import pymupdf
    out: List[List[float]] = []
    with pymupdf.open(file_path) as pdf:
        if not 1 <= page_no <= pdf.page_count:
            return out
        page = pdf[page_no - 1]
        w, h = page.rect.width, page.rect.height
        for cand in snippet_candidates(quote)[:3]:
            for r in page.search_for(cand)[:4]:
                out.append([round(r.x0 / w, 5), round(r.y0 / h, 5), round(r.x1 / w, 5), round(r.y1 / h, 5)])
            if len(out) >= max_rects:
                break
    return out[:max_rects]


def locate_in_document(file_path: str, quote: str, page: Optional[int] = None) -> dict:
    pages = get_pages(file_path)
    if not page or not 1 <= page <= len(pages):
        page = find_page(pages, quote)
    rects = locate_rects(file_path, page, quote) if page else []
    return {"page": page, "rects": rects}


# ---------------------------------------------------------------- retrieval
def retrieve(session_id: str, docs: Dict[int, Document], query: str, k_total: int) -> List[Dict[str, Any]]:
    """Top passages, spread across the chosen papers so a comparison question sees all of them."""
    coll = get_vector_collection()
    ids = list(docs)
    per = max(2, math.ceil(k_total / max(1, len(ids))))
    ranked: List[List[Dict[str, Any]]] = []
    for did in ids:
        try:
            res = coll.query(query_texts=[query], n_results=per,
                             where={"$and": [{"session_id": session_id}, {"document_id": did}]})
        except Exception as e:
            logger.warning("retrieval failed for document %s: %s", did, e)
            continue
        texts = (res.get("documents") or [[]])[0]
        ranked.append([{"document_id": did, "filename": docs[did].filename, "text": t, "kind": "retrieved"}
                       for t in texts])
    out: List[Dict[str, Any]] = []
    for rank in range(per):                       # interleave: best of each paper first
        for lst in ranked:
            if rank < len(lst) and len(out) < k_total:
                out.append(lst[rank])
    return out


def attach_pages(docs: Dict[int, Document], passages: List[Dict[str, Any]]):
    for p in passages:
        if p.get("page"):
            continue
        d = docs.get(p["document_id"])
        if d and d.file_path and os.path.exists(d.file_path):
            try:
                p["page"] = find_page(get_pages(d.file_path), p["text"])
            except Exception as e:
                logger.warning("page lookup failed: %s", e)


def cite_record(p: Dict[str, Any]) -> dict:
    q = re.sub(r"\s+", " ", p.get("text") or "").strip()
    return {"n": p["n"], "document_id": p["document_id"], "filename": p.get("filename"),
            "page": p.get("page"), "quote": q[:260], "rects": p.get("rects") or []}


def completed_docs(db, session_id: str, only: Optional[List[int]] = None) -> Dict[int, Document]:
    q = db.query(Document).filter(Document.session_id == session_id, Document.status == DocStatus.COMPLETED)
    if only:
        q = q.filter(Document.id.in_(only))
    return {d.id: d for d in q.all()}


# ---------------------------------------------------------------- ask
ASK_SYSTEM = (
    "You answer questions about the user's research papers using ONLY the numbered passages provided.\n"
    "- Cite every claim with the passage number in square brackets, like [1] or [2][3]. Never cite a number "
    "that is not in the list.\n"
    "- If the passages do not contain the answer, say so plainly and say what is missing. Do not use outside "
    "knowledge and do not guess.\n"
    "- When papers disagree, say so and cite both.\n"
    "- Be concise and precise. Quote numbers exactly as written."
)


def _recent_history(db, session_id: str, limit: int = 6) -> List[Any]:
    rows = (db.query(ChatMessage).filter(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.id.desc()).limit(limit).all())[::-1]
    out = []
    for r in rows:
        text = re.sub(r"\[\d{1,3}\]", "", r.content or "")          # old numbering no longer applies
        out.append(HumanMessage(content=text) if r.role == MessageRole.USER else AIMessage(content=text))
    return out


async def ask(db, runner: LLMRunner, session_id: str, question: str,
              doc_ids: Optional[List[int]], excerpt_ids: Optional[List[int]], dashboard_id: int) -> dict:
    docs = completed_docs(db, session_id, doc_ids or None)
    if not docs:
        raise ValueError("Add a paper to this dashboard and wait for it to finish reading, then ask again.")

    passages: List[Dict[str, Any]] = []
    if excerpt_ids:                              # passages the user highlighted come first, with exact positions
        for ex in db.query(Excerpt).filter(Excerpt.dashboard_id == dashboard_id, Excerpt.id.in_(excerpt_ids)).all():
            d = db.query(Document).filter(Document.id == ex.document_id).first()
            if d and ex.quote:
                passages.append({"document_id": ex.document_id, "filename": d.filename, "page": ex.page,
                                 "text": ex.quote, "rects": json.loads(ex.rects or "[]"), "kind": "excerpt"})
                docs.setdefault(d.id, d)
    budget = runner.budget()
    k = max(4, min(12, budget // 650))
    passages += retrieve(session_id, docs, question, k)
    attach_pages(docs, passages)

    history = _recent_history(db, session_id)
    history_budget = int(budget * 0.15)
    ctx_budget = int(budget * 0.62)
    context, included = number_passages(passages, ctx_budget)
    if not included:
        return {"answer": "I could not find anything relevant in the selected papers.", "cites": [], "usage": runner.meter.as_dict()}

    messages = [SystemMessage(content=ASK_SYSTEM)]
    if history:
        messages += fit_messages(history, history_budget)
    messages.append(HumanMessage(content=f"PASSAGES\n{context}\n\nQUESTION\n{question}"))
    raw = await runner.run(messages)

    valid = {p["n"] for p in included}
    answer, used = normalize_citations(raw, valid)
    by_n = {p["n"]: p for p in included}
    cites = [cite_record(by_n[n]) for n in used]
    return {"answer": answer.strip(), "cites": cites, "usage": runner.meter.as_dict(),
            "scope": [{"id": d.id, "filename": d.filename} for d in docs.values()]}


# ---------------------------------------------------------------- summarize
SUMMARY_NOTES_PROMPT = (
    "You are taking notes on one section of a research paper. Page markers like [p.4] appear in the text. "
    "Keep research questions, methods, datasets, sample sizes, metrics, exact numbers, main claims and stated "
    "limitations. After each fact keep its page marker, like [p.4]. Terse bullets, at most 250 words. "
    "Add nothing that is not in the text."
)
SUMMARY_PROMPT = (
    "Write a structured summary of this research paper for a researcher. Use exactly these headings in Markdown:\n"
    "**Question** · **Method** · **Key results** · **Limitations**\n"
    "Two to four short bullets under each. Every bullet must end with the page it came from, like [p.7]. "
    "Use only the provided text; if something is not stated, write 'Not stated'. Quote numbers exactly."
)


def _paged_text(pages: List[str]) -> str:
    return "\n".join(f"[p.{i}]\n{t.strip()}" for i, t in enumerate(pages, 1) if t.strip())


def _strip_references(text: str) -> str:
    matches = list(re.finditer(r"^\s*(references|bibliography)\s*$", text, re.I | re.M))
    for m in reversed(matches):
        if m.start() > len(text) * 0.5:
            return text[:m.start()]
    return text


async def summarize(runner: LLMRunner, doc: Document) -> dict:
    pages = get_pages(doc.file_path)
    text = _strip_references(_paged_text(pages)).strip()
    if not text:
        raise ValueError("This PDF has no readable text (it may be a scan).")
    whole_budget = int(runner.budget() * 0.7)
    notes_in = text
    if estimate_tokens(text) > whole_budget:
        parts = split_for_condense(text, int(runner.budget() * 0.55))
        if len(parts) > settings.TOOL_MAX_PARTS:
            raise ValueError(f"This paper is very long ({len(parts)} parts); summarising it would be costly. "
                             "Raise TOOL_MAX_PARTS or summarise a shorter file.")
        notes = []
        for part in parts:
            notes.append(await runner.run([SystemMessage(content=SUMMARY_NOTES_PROMPT), HumanMessage(content=part)]))
        notes_in = "\n\n".join(notes)
        for _ in range(2):                         # notes can still be long for a very long paper
            if estimate_tokens(notes_in) <= whole_budget:
                break
            notes_in = "\n\n".join([
                await runner.run([SystemMessage(content=SUMMARY_NOTES_PROMPT), HumanMessage(content=p)])
                for p in split_for_condense(notes_in, int(runner.budget() * 0.55))])
        notes_in = truncate_text(notes_in, whole_budget)
    raw = await runner.run([SystemMessage(content=SUMMARY_PROMPT),
                            HumanMessage(content=f"Paper: {doc.filename}\n\n{notes_in}")])
    clean, cited = normalize_page_cites(raw, len(pages))
    return {"summary": clean.strip(), "pages": cited, "usage": runner.meter.as_dict()}


# ---------------------------------------------------------------- compare (one paper = one row)
COMPARE_SYSTEM = (
    "You fill in one row of a literature comparison table for ONE paper, using ONLY the numbered passages.\n"
    "Return a single JSON object and nothing else. Keys are the column names exactly as given. Each value is "
    '{"answer": "<=30 words, plain language", "cite": [passage numbers]}.\n'
    'If the passages do not say, use {"answer": "Not stated", "cite": []}. Never invent values.'
)


async def compare_row(db, runner: LLMRunner, session_id: str, doc: Document, columns: List[str]) -> dict:
    docs = {doc.id: doc}
    seen, passages = set(), []
    for col in columns:
        for p in retrieve(session_id, docs, f"{col} of this paper", 2):
            key = p["text"][:80]
            if key not in seen:
                seen.add(key)
                passages.append(p)
    attach_pages(docs, passages)
    context, included = number_passages(passages, int(runner.budget() * 0.7))
    if not included:
        empty = {c: {"text": "Not stated in the retrieved passages", "cites": []} for c in columns}
        return {"document_id": doc.id, "filename": doc.filename, "cells": empty, "usage": runner.meter.as_dict()}
    raw = await runner.run([
        SystemMessage(content=COMPARE_SYSTEM),
        HumanMessage(content=f"PAPER: {doc.filename}\nCOLUMNS: {', '.join(columns)}\n\nPASSAGES\n{context}")])
    valid = {p["n"] for p in included}
    cells = clean_table_cells(extract_json_object(raw), columns, valid)
    by_n = {p["n"]: p for p in included}
    out = {}
    for col, cell in cells.items():
        out[col] = {"text": cell["text"], "cites": [cite_record(by_n[n]) for n in cell["cites"]]}
    return {"document_id": doc.id, "filename": doc.filename, "cells": out, "usage": runner.meter.as_dict()}


# ---------------------------------------------------------------- estimates
def estimate_action(db, action: str, docs: List[Document], columns: int, config: ProviderConfig) -> dict:
    """Rough token cost shown before the user presses the button."""
    budget = input_budget(config.provider, config.model_name)
    if action == "ask":
        return {"tokens_in": int(budget * 0.75), "tokens_out": 500}
    if action == "summarize":
        t_in = out = 0
        for d in docs:
            try:
                n = estimate_tokens(_strip_references(_paged_text(get_pages(d.file_path))))
            except Exception:
                n = 12000
            parts = max(1, math.ceil(n / max(1, int(budget * 0.7))))
            t_in += n + (parts * 400 if parts > 1 else 0) + 600
            out += parts * 320 + 500
        return {"tokens_in": t_in, "tokens_out": out}
    if action == "compare":
        per = max(1, columns) * 2 * 330 + 450
        return {"tokens_in": per * len(docs), "tokens_out": (40 * max(1, columns) + 60) * len(docs)}
    return {"tokens_in": 0, "tokens_out": 0}
