"""Figure store: ingest figures from a PDF, search them, serve them.

Uses the `Figure` table (see database_patch.py) and the same Chroma collection
as the text chunks; figure vectors carry metadata type="figure".
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Callable, Optional

from ..config import settings
from ..database import Figure
from .figure_extractor import extract_figures
from .figure_utils import labels_in_text
from .vision import describe_many, figure_search_text

FIGURES_ROOT = Path(settings.DATA_DIR) / "figures"
FIGURES_ROOT.mkdir(parents=True, exist_ok=True)


def _rel(path: str) -> str:
    return os.path.relpath(path, settings.DATA_DIR)


def figure_abs_path(fig: Figure) -> Optional[Path]:
    """Absolute image path, only if it really lives under DATA_DIR/figures."""
    p = (Path(settings.DATA_DIR) / fig.image_path).resolve()
    try:
        p.relative_to(FIGURES_ROOT.resolve())
    except ValueError:
        return None
    return p if p.is_file() else None


def figure_dict(fig: Figure) -> dict:
    return {
        "id": fig.id, "label": fig.label, "page": fig.page,
        "caption": fig.caption or "", "kind": fig.kind or "",
        "description": fig.description or "",
        "filename": getattr(fig, "filename", None),
        "url": f"/chat/figures/{fig.id}",
    }


def ingest_document_figures(
    db, collection, session_id: str, document_id: int, filename: str, pdf_path: str,
    vision_llm=None, on_progress: Optional[Callable[[int, int], None]] = None,
) -> dict:
    """Extract figures, optionally describe them with a vision model, store + embed them.

    Without `vision_llm` the figures are still saved and indexed by caption only
    (free, no API calls). Returns {"found": n, "described": n, "failed": n}.
    """
    out_dir = FIGURES_ROOT / str(session_id) / str(document_id)
    items = extract_figures(pdf_path, str(out_dir))
    if not items:
        return {"found": 0, "described": 0, "failed": 0, "figures": []}
    if vision_llm is not None:
        describe_many(vision_llm, items, workers=2, on_progress=on_progress)

    ids, docs, metas, rows = [], [], [], []
    described = failed = 0
    for it in items:
        vis = it.get("vision")
        if vis:
            described += 1
        elif vision_llm is not None:
            failed += 1
        row = Figure(
            session_id=session_id, document_id=document_id, filename=filename,
            label=it["label"], page=it["page"], caption=it["caption"],
            kind=(vis or {}).get("kind"), description=(vis or {}).get("description"),
            facts="\n".join((vis or {}).get("key_facts", [])) or None,
            image_path=_rel(it["path"]), fallback=1 if it.get("fallback") else 0,
        )
        db.add(row)
        db.flush()                       # assigns row.id
        rows.append(row)
        it["id"] = row.id
        ids.append(f"fig-{row.id}")
        docs.append(figure_search_text(it["label"], it["page"], it["caption"], vis))
        metas.append({
            "session_id": session_id, "document_id": document_id, "type": "figure",
            "figure_id": row.id, "label": it["label"], "page": it["page"],
        })
    db.commit()
    if collection is not None:           # tool uploads skip the vector index
        for i in range(0, len(ids), 50):
            collection.add(ids=ids[i:i + 50], documents=docs[i:i + 50], metadatas=metas[i:i + 50])
    return {"found": len(items), "described": described, "failed": failed,
            "figures": [figure_dict(r) for r in rows]}


def delete_document_figures(db, document_id: int) -> None:
    """DB rows + image files. (Chroma vectors are removed by the existing
    `where={"document_id": ...}` delete, since figure vectors carry that metadata.)"""
    rows = db.query(Figure).filter(Figure.document_id == document_id).all()
    dirs = set()
    for r in rows:
        p = (Path(settings.DATA_DIR) / r.image_path)
        dirs.add(p.parent)
        db.delete(r)
    db.commit()
    for d in dirs:
        if FIGURES_ROOT.resolve() in d.resolve().parents:
            shutil.rmtree(d, ignore_errors=True)


def delete_session_figures(db, session_id: str) -> None:
    db.query(Figure).filter(Figure.session_id == session_id).delete()
    db.commit()
    shutil.rmtree(FIGURES_ROOT / str(session_id), ignore_errors=True)


def search_figures(db, collection, session_id: str, query: str, k: int = 3) -> list:
    """Figures for a question: exact 'Figure N' mentions first, then semantic matches."""
    found: list = []
    seen: set = set()

    def add(f):
        if f is not None and f.id not in seen:
            seen.add(f.id)
            found.append(f)

    for label in labels_in_text(query):
        for f in db.query(Figure).filter(Figure.session_id == session_id, Figure.label == label).all():
            add(f)
    try:
        res = collection.query(
            query_texts=[query], n_results=max(k, 1),
            where={"$and": [{"session_id": session_id}, {"type": "figure"}]},
        )
        for meta in (res.get("metadatas") or [[]])[0]:
            fid = meta.get("figure_id")
            if fid is not None:
                add(db.query(Figure).filter(Figure.id == fid, Figure.session_id == session_id).first())
    except Exception:
        pass            # no figures indexed yet
    return found[: max(k, len(labels_in_text(query)))]


def valid_figure_labels(db, session_id: str, ids: list) -> dict:
    """{id: label} for the ids that really belong to this session."""
    if not ids:
        return {}
    rows = db.query(Figure).filter(Figure.session_id == session_id, Figure.id.in_(ids)).all()
    return {r.id: f"{r.label}" for r in rows}


def figures_by_ids(db, session_id: str, ids: list) -> list:
    rows = db.query(Figure).filter(Figure.session_id == session_id, Figure.id.in_(ids)).all()
    order = {i: n for n, i in enumerate(ids)}
    return [figure_dict(r) for r in sorted(rows, key=lambda r: order[r.id])]
