"""Stage 2 API: grounded chat, summaries, comparison rows, citations, token meter."""
import json
import logging
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .config import RateLimitError
from .dashboards import _dash, _touch, get_db
from .database import AiUsage, ChatMessage, Dashboard, Document, DocStatus, MessageRole
from .provider_factory import ProviderConfig
from .services import dashboard_ai as ai
from .services.dashboard_utils import clean_text
from .services.token_budget import is_too_large_error

logger = logging.getLogger(__name__)
router = APIRouter()


class AIConfig(BaseModel):
    provider: str
    api_key: str
    model_name: Optional[str] = None


def _runner(cfg: AIConfig) -> ai.LLMRunner:
    try:
        return ai.LLMRunner(ProviderConfig(provider=cfg.provider, api_key=cfg.api_key, model_name=cfg.model_name))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _record(db, d: Dashboard, action: str, runner: ai.LLMRunner):
    m = runner.meter
    db.add(AiUsage(dashboard_id=d.id, action=action, provider=runner.config.provider,
                   model=runner.config.model_name, tokens_in=m.tokens_in, tokens_out=m.tokens_out,
                   estimated=1 if m.estimated else 0))
    _touch(d)
    db.commit()


def _wrap(e: Exception):
    if isinstance(e, HTTPException):
        return e
    if isinstance(e, ValueError):
        return HTTPException(status_code=400, detail=str(e))
    if isinstance(e, RateLimitError) or is_too_large_error(e):
        return HTTPException(status_code=429, detail=(
            "The model provider's limit was reached. Wait a minute and try again, select fewer papers, "
            f"or use a model with a higher limit. ({str(e)[:200]})"))
    logger.error("dashboard AI error: %s", e, exc_info=True)
    return HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------- ask
class AskIn(AIConfig):
    text: str
    document_ids: Optional[List[int]] = None
    excerpt_ids: Optional[List[int]] = None


@router.post("/dashboards/{dash_id}/ask")
async def ask(dash_id: str, body: AskIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    question = clean_text(body.text, 4000)
    if not question:
        raise HTTPException(status_code=422, detail="Type a question first.")
    runner = _runner(body)
    try:
        result = await ai.ask(db, runner, d.session_id, question, body.document_ids, body.excerpt_ids, d.id)
        db.add(ChatMessage(session_id=d.session_id, role=MessageRole.USER, content=question))
        db.add(ChatMessage(session_id=d.session_id, role=MessageRole.ASSISTANT, content=result["answer"],
                           citations=json.dumps({"cites": result["cites"], "scope": result.get("scope", [])})))
        db.commit()
        _record(db, d, "ask", runner)
        return result
    except Exception as e:
        raise _wrap(e)


@router.get("/dashboards/{dash_id}/chat")
def chat_history(dash_id: str, db=Depends(get_db)):
    d = _dash(db, dash_id)
    rows = db.query(ChatMessage).filter(ChatMessage.session_id == d.session_id).order_by(ChatMessage.id).all()
    out = []
    for r in rows:
        extra = {}
        try:
            extra = json.loads(r.citations) if r.citations else {}
        except ValueError:
            pass
        out.append({"id": r.id, "role": r.role.value, "content": r.content,
                    "cites": extra.get("cites", []) if isinstance(extra, dict) else []})
    return out


@router.delete("/dashboards/{dash_id}/chat")
def clear_chat(dash_id: str, db=Depends(get_db)):
    d = _dash(db, dash_id)
    db.query(ChatMessage).filter(ChatMessage.session_id == d.session_id).delete()
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- summarize / compare
class SummarizeIn(AIConfig):
    document_id: int


def _doc(db, d: Dashboard, doc_id: int) -> Document:
    doc = db.query(Document).filter(Document.id == doc_id, Document.session_id == d.session_id).first()
    if not doc or not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Paper not found on this dashboard.")
    if doc.status != DocStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="This paper is still being read. Try again in a moment.")
    return doc


@router.post("/dashboards/{dash_id}/summarize")
async def summarize(dash_id: str, body: SummarizeIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    doc = _doc(db, d, body.document_id)
    runner = _runner(body)
    try:
        result = await ai.summarize(runner, doc)
        _record(db, d, "summarize", runner)
        return result
    except Exception as e:
        raise _wrap(e)


class CompareRowIn(AIConfig):
    document_id: int
    columns: List[str]


@router.post("/dashboards/{dash_id}/compare-row")
async def compare_row(dash_id: str, body: CompareRowIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    doc = _doc(db, d, body.document_id)
    cols = [clean_text(c, 60) for c in body.columns if clean_text(c, 60)][:8]
    if not cols:
        raise HTTPException(status_code=422, detail="Add at least one column.")
    runner = _runner(body)
    try:
        result = await ai.compare_row(db, runner, d.session_id, doc, cols)
        _record(db, d, "compare", runner)
        return result
    except Exception as e:
        raise _wrap(e)


# ---------------------------------------------------------------- citations, estimates, usage
class LocateIn(BaseModel):
    document_id: int
    quote: str
    page: Optional[int] = None


@router.post("/dashboards/{dash_id}/locate")
def locate(dash_id: str, body: LocateIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    doc = db.query(Document).filter(Document.id == body.document_id, Document.session_id == d.session_id).first()
    if not doc or not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Paper not found.")
    try:
        return ai.locate_in_document(doc.file_path, body.quote, body.page)
    except Exception as e:
        raise _wrap(e)


class EstimateIn(BaseModel):
    action: str
    document_ids: List[int] = []
    columns: int = 5
    provider: str = "groq"
    model_name: Optional[str] = None


@router.post("/dashboards/{dash_id}/estimate")
def estimate(dash_id: str, body: EstimateIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    docs = [x for x in db.query(Document).filter(Document.session_id == d.session_id,
                                                 Document.id.in_(body.document_ids or [0])).all()
            if x.file_path and os.path.exists(x.file_path)]
    cfg = ProviderConfig(provider=body.provider, api_key="x", model_name=body.model_name)
    return ai.estimate_action(db, body.action, docs, body.columns, cfg)


@router.get("/dashboards/{dash_id}/usage")
def usage(dash_id: str, db=Depends(get_db)):
    d = _dash(db, dash_id)
    rows = db.query(AiUsage).filter(AiUsage.dashboard_id == d.id).all()
    by = {}
    for r in rows:
        a = by.setdefault(r.action, {"calls": 0, "tokens_in": 0, "tokens_out": 0})
        a["calls"] += 1
        a["tokens_in"] += r.tokens_in or 0
        a["tokens_out"] += r.tokens_out or 0
    return {"tokens_in": sum(r.tokens_in or 0 for r in rows), "tokens_out": sum(r.tokens_out or 0 for r in rows),
            "actions": len(rows), "estimated": any(r.estimated for r in rows), "by_action": by}
