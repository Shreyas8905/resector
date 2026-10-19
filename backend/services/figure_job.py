"""Background job: extract + (optionally) describe figures for one uploaded PDF.

Runs separately from text indexing, so a vision failure never breaks the text
index. The user's API key lives only in this function's arguments (memory) and is
never stored.
"""
from __future__ import annotations

import logging
from typing import Optional

from ..database import SessionLocal, get_vector_collection
from .figures import ingest_document_figures
from .vision_models import build_vision_llm, pick_vision_model

logger = logging.getLogger("resector.figures")

# job status, in memory only: {document_id: {"state": ..., "done": n, "total": n, ...}}
FIGURE_JOBS: dict = {}


def run_figure_job(
    session_id: str, document_id: int, filename: str, pdf_path: str,
    analyze: bool = False, provider: Optional[str] = None, api_key: Optional[str] = None,
    model_name: Optional[str] = None, vision_model: Optional[str] = None,
) -> None:
    FIGURE_JOBS[document_id] = {"state": "running", "done": 0, "total": 0}
    db = SessionLocal()
    try:
        llm = None
        if analyze and provider and api_key:
            model = pick_vision_model(provider, model_name, vision_model)
            llm = build_vision_llm(provider, api_key, model)
            FIGURE_JOBS[document_id]["model"] = model

        def progress(done: int, total: int):
            FIGURE_JOBS[document_id].update(done=done, total=total)

        stats = ingest_document_figures(
            db, get_vector_collection(), session_id, document_id, filename, pdf_path,
            vision_llm=llm, on_progress=progress,
        )
        FIGURE_JOBS[document_id].update(state="done", **stats)
    except Exception as e:  # noqa: BLE001
        logger.error("Figure job failed for document %s: %s", document_id, e, exc_info=True)
        FIGURE_JOBS[document_id] = {"state": "error", "error": f"{type(e).__name__}: {str(e)[:200]}"}
    finally:
        db.close()
