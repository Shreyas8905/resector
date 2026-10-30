"""Research Dashboard (canvas) API. Stage 1: boards, papers, excerpts, notes, links, comments, export."""
import json
import logging
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

from .config import settings, UPLOAD_DIR
from .database import (
    SessionLocal, UserSession, Document, DocStatus, Dashboard, CanvasNode, CanvasEdge,
    Excerpt, CanvasComment, AiUsage, WireSuggestion, AgentRun, get_vector_collection,
)
from .services.dashboard_utils import (
    validate_canvas, normalize_rects, union_rect, clean_text, context_around,
)
from .services.pdf_processor import PDFProcessor
from .services.figures import delete_session_figures

logger = logging.getLogger(__name__)
router = APIRouter()

EXCERPTS_ROOT = Path(settings.DATA_DIR) / "excerpts"
EXCERPTS_ROOT.mkdir(parents=True, exist_ok=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _dash(db, dash_id: str) -> Dashboard:
    d = db.query(Dashboard).filter(Dashboard.dash_id == dash_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return d


def _touch(d: Dashboard):
    d.updated_at = datetime.now(timezone.utc)


def _doc_json(doc: Document) -> dict:
    return {
        "id": doc.id, "filename": doc.filename, "progress": doc.progress or 0,
        "status": doc.status.value if hasattr(doc.status, "value") else str(doc.status),
    }


def _exc_json(e: Excerpt) -> dict:
    return {
        "id": e.id, "document_id": e.document_id, "page": e.page, "kind": e.kind,
        "rects": json.loads(e.rects or "[]"), "quote": e.quote or "",
        "prefix": e.prefix or "", "suffix": e.suffix or "",
        "has_image": bool(e.image_path),
    }


def _comment_json(c: CanvasComment) -> dict:
    return {"id": c.id, "node_id": c.node_id, "author": c.author, "text": c.text,
            "resolved": bool(c.resolved), "created_at": c.created_at}


# ---------------------------------------------------------------- dashboards
class DashboardIn(BaseModel):
    title: Optional[str] = None
    project: Optional[str] = None


@router.get("/dashboards")
def list_dashboards(db=Depends(get_db)):
    rows = db.query(Dashboard).order_by(Dashboard.updated_at.desc()).all()
    out = []
    for d in rows:
        n = db.query(CanvasNode).filter(CanvasNode.dashboard_id == d.id)
        out.append({
            "id": d.dash_id, "title": d.title, "project": d.project or "",
            "papers": n.filter(CanvasNode.type == "paper").count(),
            "nodes": n.count(), "updated_at": d.updated_at,
        })
    return out


@router.post("/dashboards")
def create_dashboard(body: DashboardIn, db=Depends(get_db)):
    sid = f"dash_{uuid.uuid4().hex[:16]}"
    title = clean_text(body.title, 120) or "Untitled dashboard"
    db.add(UserSession(session_id=sid, title=f"[dashboard] {title}"))
    d = Dashboard(dash_id=uuid.uuid4().hex[:12], session_id=sid, title=title,
                  project=clean_text(body.project, 160))
    db.add(d)
    db.commit()
    return {"id": d.dash_id, "title": d.title, "project": d.project, "session_id": sid}


@router.patch("/dashboards/{dash_id}")
def update_dashboard(dash_id: str, body: DashboardIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    if body.title is not None:
        d.title = clean_text(body.title, 120) or d.title
    if body.project is not None:
        d.project = clean_text(body.project, 160)
    _touch(d)
    db.commit()
    return {"id": d.dash_id, "title": d.title, "project": d.project}


@router.delete("/dashboards/{dash_id}")
def delete_dashboard(dash_id: str, db=Depends(get_db)):
    d = _dash(db, dash_id)
    sid = d.session_id
    for doc in db.query(Document).filter(Document.session_id == sid).all():
        if doc.file_path and os.path.exists(doc.file_path):
            try:
                os.remove(doc.file_path)
            except OSError as e:
                logger.warning("Could not remove %s: %s", doc.file_path, e)
        db.delete(doc)
    try:
        delete_session_figures(db, sid)
    except Exception as e:
        logger.warning("figure cleanup failed for %s: %s", sid, e)
    try:
        get_vector_collection().delete(where={"session_id": sid})
    except Exception as e:
        logger.warning("chroma cleanup failed for %s: %s", sid, e)
    shutil.rmtree(EXCERPTS_ROOT / str(d.id), ignore_errors=True)
    for model in (CanvasNode, CanvasEdge, Excerpt, CanvasComment, AiUsage, WireSuggestion, AgentRun):
        db.query(model).filter(model.dashboard_id == d.id).delete()
    db.delete(d)
    s = db.query(UserSession).filter(UserSession.session_id == sid).first()
    if s:
        db.delete(s)
    db.commit()
    return {"ok": True}


@router.get("/dashboards/{dash_id}")
def get_dashboard(dash_id: str, db=Depends(get_db)):
    d = _dash(db, dash_id)
    nodes = db.query(CanvasNode).filter(CanvasNode.dashboard_id == d.id).all()
    edges = db.query(CanvasEdge).filter(CanvasEdge.dashboard_id == d.id).all()
    docs = db.query(Document).filter(Document.session_id == d.session_id).all()
    excerpts = db.query(Excerpt).filter(Excerpt.dashboard_id == d.id).all()
    comments = db.query(CanvasComment).filter(CanvasComment.dashboard_id == d.id).order_by(CanvasComment.id).all()
    return {
        "id": d.dash_id, "title": d.title, "project": d.project or "", "session_id": d.session_id,
        "nodes": [{
            "id": n.node_id, "type": n.type, "position": {"x": n.x, "y": n.y},
            **({"width": n.width} if n.width else {}), **({"height": n.height} if n.height else {}),
            "data": json.loads(n.data or "{}"),
        } for n in nodes],
        "edges": [{
            "id": e.edge_id, "source": e.source, "target": e.target,
            "sourceHandle": e.source_handle, "targetHandle": e.target_handle,
            "data": {"kind": e.kind, "label": e.label or ""},
        } for e in edges],
        "documents": [_doc_json(x) for x in docs],
        "excerpts": [_exc_json(x) for x in excerpts],
        "comments": [_comment_json(c) for c in comments],
    }


class CanvasIn(BaseModel):
    nodes: list
    edges: list


@router.put("/dashboards/{dash_id}/canvas")
def save_canvas(dash_id: str, body: CanvasIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    try:
        nodes, edges = validate_canvas(body.nodes, body.edges)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    # Replace-all inside one transaction: simple, and the canvas is small.
    db.query(CanvasNode).filter(CanvasNode.dashboard_id == d.id).delete()
    db.query(CanvasEdge).filter(CanvasEdge.dashboard_id == d.id).delete()
    for n in nodes:
        db.add(CanvasNode(dashboard_id=d.id, node_id=n["id"], type=n["type"], x=n["x"], y=n["y"],
                          width=n["width"], height=n["height"], data=json.dumps(n["data"], ensure_ascii=False)))
    for e in edges:
        db.add(CanvasEdge(dashboard_id=d.id, edge_id=e["id"], source=e["source"], target=e["target"],
                          source_handle=e["source_handle"], target_handle=e["target_handle"],
                          kind=e["kind"], label=e["label"]))
    _touch(d)
    db.commit()
    return {"ok": True, "nodes": len(nodes), "edges": len(edges)}


# ---------------------------------------------------------------- papers
@router.get("/dashboards/{dash_id}/documents")
def dashboard_documents(dash_id: str, db=Depends(get_db)):
    d = _dash(db, dash_id)
    return [_doc_json(x) for x in db.query(Document).filter(Document.session_id == d.session_id).all()]


@router.get("/dashboards/library/papers")
def library_papers(exclude: Optional[str] = None, db=Depends(get_db)):
    """Every paper the user has uploaded anywhere, so it can be imported onto a dashboard."""
    skip = None
    if exclude:
        d = db.query(Dashboard).filter(Dashboard.dash_id == exclude).first()
        skip = d.session_id if d else None
    rows = db.query(Document).filter(Document.status == DocStatus.COMPLETED).all()
    seen, out = set(), []
    for r in rows:
        if r.session_id == skip or not r.file_path or not os.path.exists(r.file_path):
            continue
        key = r.filename
        if key in seen:
            continue
        seen.add(key)
        out.append({"id": r.id, "filename": r.filename})
    return out


class ImportIn(BaseModel):
    document_ids: List[int]


@router.post("/dashboards/{dash_id}/import")
def import_papers(dash_id: str, body: ImportIn, background_tasks: BackgroundTasks, db=Depends(get_db)):
    d = _dash(db, dash_id)
    processor = PDFProcessor(session_id=d.session_id)
    created = []
    for src_id in body.document_ids[:50]:
        src = db.query(Document).filter(Document.id == src_id).first()
        if not src or not src.file_path or not os.path.exists(src.file_path):
            continue
        dest = str(UPLOAD_DIR / f"{uuid.uuid4()}_{os.path.basename(src.filename or 'paper.pdf')}")
        shutil.copyfile(src.file_path, dest)      # own copy, so deleting either side is safe
        doc = Document(session_id=d.session_id, filename=src.filename, file_path=dest)
        db.add(doc)
        db.commit()
        created.append(doc)
        background_tasks.add_task(processor.process_and_index, doc.id, dest)
    _touch(d)
    db.commit()
    return [_doc_json(x) for x in created]


@router.get("/documents/{doc_id}/file")
def document_file(doc_id: int, db=Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc or not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(doc.file_path, media_type="application/pdf", filename=doc.filename)


# ---------------------------------------------------------------- excerpts
class ExcerptIn(BaseModel):
    document_id: int
    page: int
    kind: str = "text"
    rects: list
    quote: Optional[str] = ""


def _page_text_and_clip(path: str, page_no: int, rect: list):
    import pymupdf
    with pymupdf.open(path) as pdf:
        if page_no < 1 or page_no > pdf.page_count:
            raise HTTPException(status_code=422, detail="Page out of range")
        page = pdf[page_no - 1]
        w, h = page.rect.width, page.rect.height
        clip = pymupdf.Rect(rect[0] * w, rect[1] * h, rect[2] * w, rect[3] * h)
        return page.get_text("text"), page.get_text("text", clip=clip), page.get_pixmap(clip=clip, dpi=150)


@router.post("/dashboards/{dash_id}/excerpts")
def create_excerpt(dash_id: str, body: ExcerptIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    doc = db.query(Document).filter(Document.id == body.document_id, Document.session_id == d.session_id).first()
    if not doc or not os.path.exists(doc.file_path or ""):
        raise HTTPException(status_code=404, detail="Paper not found on this dashboard")
    rects = normalize_rects(body.rects)
    if not rects:
        raise HTTPException(status_code=422, detail="Empty selection")
    kind = "area" if body.kind == "area" else "text"
    quote = clean_text(body.quote)
    page_text, clipped, pix = "", "", None
    try:
        page_text, clipped, pix = _page_text_and_clip(doc.file_path, body.page, union_rect(rects))
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("excerpt context extraction failed: %s", e)
    if kind == "area" and not quote:
        quote = clean_text(clipped)            # text under the box, so the AI can read it later
    prefix, suffix = context_around(page_text, quote)
    ex = Excerpt(dashboard_id=d.id, document_id=doc.id, page=body.page, kind=kind,
                 rects=json.dumps(rects), quote=quote, prefix=prefix, suffix=suffix)
    db.add(ex)
    db.commit()
    if kind == "area" and pix is not None:
        out = EXCERPTS_ROOT / str(d.id)
        out.mkdir(parents=True, exist_ok=True)
        path = out / f"{ex.id}.png"
        pix.save(str(path))
        ex.image_path = os.path.relpath(path, settings.DATA_DIR)
        db.commit()
    return _exc_json(ex)


@router.get("/excerpts/{excerpt_id}/image")
def excerpt_image(excerpt_id: int, db=Depends(get_db)):
    ex = db.query(Excerpt).filter(Excerpt.id == excerpt_id).first()
    if not ex or not ex.image_path:
        raise HTTPException(status_code=404, detail="No image")
    p = (Path(settings.DATA_DIR) / ex.image_path).resolve()
    try:
        p.relative_to(EXCERPTS_ROOT.resolve())
    except ValueError:
        raise HTTPException(status_code=404, detail="No image")
    if not p.exists():
        raise HTTPException(status_code=404, detail="No image")
    return FileResponse(str(p), media_type="image/png")


@router.delete("/excerpts/{excerpt_id}")
def delete_excerpt(excerpt_id: int, db=Depends(get_db)):
    ex = db.query(Excerpt).filter(Excerpt.id == excerpt_id).first()
    if ex:
        if ex.image_path:
            try:
                os.remove(Path(settings.DATA_DIR) / ex.image_path)
            except OSError:
                pass
        db.delete(ex)
        db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- comments
class CommentIn(BaseModel):
    node_id: Optional[str] = None
    text: str
    author: Optional[str] = None


@router.post("/dashboards/{dash_id}/comments")
def add_comment(dash_id: str, body: CommentIn, db=Depends(get_db)):
    d = _dash(db, dash_id)
    text = (body.text or "").strip()[:4000]
    if not text:
        raise HTTPException(status_code=422, detail="Empty comment")
    c = CanvasComment(dashboard_id=d.id, node_id=body.node_id, text=text,
                      author=clean_text(body.author, 60) or "You")
    db.add(c)
    _touch(d)
    db.commit()
    return _comment_json(c)


@router.patch("/comments/{comment_id}")
def resolve_comment(comment_id: int, resolved: bool = True, db=Depends(get_db)):
    c = db.query(CanvasComment).filter(CanvasComment.id == comment_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    c.resolved = 1 if resolved else 0
    db.commit()
    return _comment_json(c)


@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, db=Depends(get_db)):
    c = db.query(CanvasComment).filter(CanvasComment.id == comment_id).first()
    if c:
        db.delete(c)
        db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- export
@router.get("/dashboards/{dash_id}/export.md", response_class=PlainTextResponse)
def export_markdown(dash_id: str, db=Depends(get_db)):
    from .services.dashboard_export import build_markdown
    data = get_dashboard(dash_id, db)
    return PlainTextResponse(build_markdown(data), media_type="text/markdown; charset=utf-8")
