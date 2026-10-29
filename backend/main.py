from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks, Depends, Query, Form, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import uuid
import logging
import tempfile
from typing import List, Optional, Generator
from pydantic import BaseModel, Field

from .database import Figure, init_db, SessionLocal, ResearchLog, get_vector_collection, UserSession, Document, ChatMessage, GraphSnapshot, warm_up_embedding_model, DocStatus
from .tools import ToolLogic, ResearchRequest, ResearchResponse, log_research, DocumentTooLongError
from .provider_factory import ProviderConfig, ProviderFactory
from .config import settings, RateLimitError, UPLOAD_DIR
from .services.pdf_processor import PDFProcessor
from .services.rag_agent import RAGAgent, get_chat_history, save_chat_message
from .services.graph_service import GraphService
from .services.figures import figure_abs_path, delete_document_figures, delete_session_figures
from .services.figure_job import run_figure_job, FIGURE_JOBS
from .services.figure_tools import finalize_answer
from .services.tool_figures import prepare_tool_figures, figure_digest, figures_mentioned, append_figures_markdown
from .services.vision_models import build_vision_llm, pick_vision_model
import json
import asyncio

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan handler for startup and shutdown events."""
    # Startup: creates all tables (including title/updated_at) in SQLite
    init_db()

    logger.info("Preparing embedding model (first..")
    await asyncio.to_thread(warm_up_embedding_model)
    logger.info("Embedding model ready.")

    yield  # Application runs here

    # Shutdown (if needed)
    logger.info("Application shutting down.")


app = FastAPI(title="Resector Backend", lifespan=lifespan)

# CORS: use explicit origins when credentials are enabled.
# In development, allow localhost frontends; override via ALLOWED_ORIGINS env var.
_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db() -> Generator:
    """FastAPI dependency that yields a DB session and ensures cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Validation Models ---

class ValidateKeyRequest(BaseModel):
    provider: str
    api_key: str
    model_name: Optional[str] = None

class ValidateTavilyRequest(BaseModel):
    api_key: str

class ChatRequest(BaseModel):
    session_id: str
    text: str
    provider: str
    api_key: str
    tavily_api_key: Optional[str] = None
    model_name: Optional[str] = None

class CreateSessionRequest(BaseModel):
    title: str

class GraphGenerateRequest(BaseModel):
    session_id: Optional[str] = None
    query: Optional[str] = None
    title: Optional[str] = None
    paper_id: Optional[str] = None
    s2_api_key: Optional[str] = None
    tavily_api_key: Optional[str] = None
    max_nodes: Optional[int] = 50

class DeleteGraphSessionRequest(BaseModel):
    session_id: Optional[str] = None

# --- Validation Endpoints ---

@app.post("/validate-key")
async def validate_key(req: ValidateKeyRequest):
    try:
        config = ProviderConfig(provider=req.provider, api_key=req.api_key, model_name=req.model_name)
        llm = ProviderFactory.get_llm(config)
        await llm.ainvoke("Ping")
        return {"valid": True, "message": "API key is valid"}
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid API key for {req.provider}: {str(e)}")

@app.post("/validate-tavily")
async def validate_tavily(req: ValidateTavilyRequest):
    try:
        from tavily import TavilyClient
        tavily = TavilyClient(api_key=req.api_key)
        tavily.search(query="test", search_depth="basic", max_results=1)
        return {"valid": True, "message": "Tavily key is valid"}
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Tavily API key: {str(e)}")

@app.get("/health")
async def health_check():
    # Mask credentials in DATABASE_URL for security
    db_url = settings.DATABASE_URL
    if db_url and "@" in db_url:
        # Hide password: postgresql://user:pass@host/db -> postgresql://user:***@host/db
        db_url = db_url.split("://")[0] + "://" + db_url.split("://")[1].split("@")[0].split(":")[0] + ":***@" + db_url.split("@")[1]
    return {"status": "healthy", "database": db_url}

# --- Original Tool Endpoints ---

@app.post("/process/sifter", response_model=ResearchResponse)
async def process_sifter(req: ResearchRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    config = ProviderConfig(provider=req.provider, api_key=req.api_key, model_name=req.model_name)
    try:
        tavily_key = req.tavily_api_key or settings.TAVILY_API_KEY or None
        output = await ToolLogic.sifter(config, req.text, tavily_key)
        await log_research("sifter", req.text, output, req.provider)
        return ResearchResponse(output=output, provider=req.provider)
    except Exception as e:
        logger.error(f"ERROR in sifter: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process/critique", response_model=ResearchResponse)
async def process_critique(req: ResearchRequest):
    if not req.text or not req.text.strip():
            raise HTTPException(status_code=400, detail="Text is required")
    config = ProviderConfig(provider=req.provider, api_key=req.api_key, model_name=req.model_name)
    try:
        tavily_key = req.tavily_api_key or settings.TAVILY_API_KEY or None
        output = await ToolLogic.critique(config, req.text, req.severity, tavily_key)
        await log_research("critique", req.text, output, req.provider)
        return ResearchResponse(output=output, provider=req.provider)
    except Exception as e:
        logger.error(f"ERROR in critique: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process/jargon", response_model=ResearchResponse)
async def process_jargon(req: ResearchRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    config = ProviderConfig(provider=req.provider, api_key=req.api_key, model_name=req.model_name)
    try:
        output = await ToolLogic.jargon(config, req.text)
        tavily_key = req.tavily_api_key or settings.TAVILY_API_KEY or None
        await log_research("jargon", req.text, output, req.provider, tavily_key)
        return ResearchResponse(output=output, provider=req.provider)
    except Exception as e:
        logger.error(f"ERROR in jargon: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

MAX_TOOL_UPLOAD_BYTES = 25 * 1024 * 1024
TOOL_UPLOAD_EXTS = {".pdf", ".txt", ".md"}


@app.post("/process/{tool}/upload", response_model=ResearchResponse)
async def process_tool_upload(
    request: Request,
    tool: str,
    file: UploadFile = File(...),
    provider: str = Form(...),
    api_key: str = Form(...),
    model_name: Optional[str] = Form(None),
    tavily_api_key: Optional[str] = Form(None),
    severity: str = Form("constructive_colleague"),
    analyze_figures: bool = Form(False),
):
    if tool not in ("sifter", "critique", "jargon"):
        raise HTTPException(status_code=404, detail="Unknown tool")

    filename = os.path.basename(file.filename or "document")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in TOOL_UPLOAD_EXTS:
        raise HTTPException(status_code=415, detail="Upload a PDF, .txt or .md file")

    data = await file.read()
    if len(data) > MAX_TOOL_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 25 MB")

    try:
        config = ProviderConfig(provider=provider, api_key=api_key, model_name=model_name or None)

        figs: list = []
        if ext == ".pdf":
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp.write(data)
                tmp_path = tmp.name
            try:
                text = await asyncio.to_thread(PDFProcessor(session_id="tools").extract_text, tmp_path)
                # Figures: always extracted (free); described by a vision model only if the user opted in.
                # Never let a figure problem break the text analysis.
                try:
                    vision_llm = None
                    if analyze_figures:
                        vision_llm = build_vision_llm(provider, api_key, pick_vision_model(provider, model_name))

                    def _figs():
                        db_ = SessionLocal()
                        try:
                            return prepare_tool_figures(db_, tmp_path, filename, vision_llm)
                        finally:
                            db_.close()

                    figs = await asyncio.to_thread(_figs)
                    text = text + figure_digest(figs)
                except Exception as fe:
                    logger.warning(f"Figure extraction skipped for {filename}: {fe}")
                    figs = []
            finally:
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
        else:
            text = data.decode("utf-8", errors="ignore")

        tavily_key = tavily_api_key or settings.TAVILY_API_KEY or None
        output = await ToolLogic.run_document(tool, config, text, filename, severity, tavily_key)
        output = append_figures_markdown(output, figures_mentioned(output, figs), str(request.base_url).rstrip("/"))
        await log_research(tool, f"[Document: {filename}] {text[:500]}", output, provider)
        return ResearchResponse(output=output, provider=provider)
    except DocumentTooLongError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except RateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"ERROR in {tool} upload: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/search")
async def search_research(query: str = Query(..., description="Search query string")):
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Query required")

    try:
        collection = get_vector_collection()
        results = collection.query(
            query_texts=[query],
            n_results=5
        )

        formatted_results = []
        for i in range(len(results['documents'][0])):
            doc = results['documents'][0][i]
            meta = results['metadatas'][0][i]
            formatted_results.append({
                "content": doc,
                "tool": meta.get("tool", "unknown"),
                "date": "Recent"
            })
        return {"results": formatted_results}
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/chat/documents/{session_id}")
async def list_documents(session_id: str, db=Depends(get_db)):
    docs = db.query(Document).filter(Document.session_id == session_id).all()
    return [{"id": d.id, "filename": d.filename, "status": d.status.value, "progress": d.progress} for d in docs]

@app.delete("/chat/documents/{doc_id}")
async def delete_document(doc_id: int, db=Depends(get_db)):
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        session_id = doc.session_id
        file_path = doc.file_path

        db.delete(doc)
        db.commit()
        delete_document_figures(db, doc_id)
        FIGURE_JOBS.pop(doc_id, None)
        # Remove this document's chunks from ChromaDB
        try:
            get_vector_collection().delete(
                where={"$and": [{"document_id": doc_id}, {"session_id": session_id}]}
            )
        except Exception as e:
            logger.warning(f"Failed to remove Chroma chunks for document {doc_id}: {e}")

        # Remove file from disk
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError as e:
                logger.warning(f"Failed to remove file {file_path}: {e}")

        return {"message": "Document deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting document {doc_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat/sessions")
async def create_session(req: CreateSessionRequest, db=Depends(get_db)):
    session = UserSession(session_id=str(uuid.uuid4()), title=req.title)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"session_id": session.session_id}

@app.get("/chat/sessions")
async def list_sessions(db=Depends(get_db)):
    sessions = db.query(UserSession).filter(~UserSession.session_id.like("dash\\_%", escape="\\")).all()
    return [{"id": s.session_id, "title": s.title, "updated_at": s.updated_at} for s in sessions]

@app.post("/chat/upload")
async def upload_pdf(
    background_tasks: BackgroundTasks,
    session_id: str,
    files: List[UploadFile] = File(...),
    analyze_figures: bool = Form(False),
    provider: Optional[str] = Form(None),
    api_key: Optional[str] = Form(None),
    model_name: Optional[str] = Form(None),
    vision_model: Optional[str] = Form(None),
    db=Depends(get_db)
):
    doc_ids = []
    for file in files:
        # Sanitize filename to prevent path traversal
        safe_filename = os.path.basename(file.filename or "unnamed.pdf")
        file_path = str(UPLOAD_DIR / f"{uuid.uuid4()}_{safe_filename}")

        with open(file_path, "wb") as f:
            f.write(await file.read())

        doc = Document(session_id=session_id, filename=safe_filename, file_path=file_path)
        db.add(doc)
        db.commit()
        doc_ids.append(doc.id)

    # Start background processing for each file
    processor = PDFProcessor(session_id=session_id)
    for doc_id in doc_ids:
        doc_record = db.query(Document).filter(Document.id == doc_id).first()
        background_tasks.add_task(processor.process_and_index, doc_id, doc_record.file_path)
        if doc_record.filename.lower().endswith(".pdf"):
            # Separate job: a figure/vision failure never affects the text index.
            background_tasks.add_task(
                run_figure_job, session_id, doc_id, doc_record.filename, doc_record.file_path,
                analyze_figures, provider, api_key, model_name, vision_model,
            )

    task_id = ",".join(str(i) for i in doc_ids)
    return {"task_id": task_id, "doc_ids": doc_ids}

@app.get("/chat/tasks/{task_id}")
async def get_task_status(task_id: str, db=Depends(get_db)):
    try:
        ids = [int(x) for x in task_id.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task id")

    docs = db.query(Document).filter(Document.id.in_(ids)).all() if ids else []
    if not docs:
        return {"status": "no_documents", "progress": 0}

    finished = (DocStatus.COMPLETED, DocStatus.FAILED)
    progress = sum(100 if d.status in finished else d.progress for d in docs) / len(docs)

    if all(d.status in finished for d in docs):
        status = "failed" if any(d.status == DocStatus.FAILED for d in docs) else "completed"
    else:
        status = "processing"
    return {"status": status, "progress": int(progress)}

@app.get("/chat/figures/{figure_id}")
async def get_figure_image(figure_id: int, db=Depends(get_db)):
    fig = db.query(Figure).filter(Figure.id == figure_id).first()
    path = figure_abs_path(fig) if fig else None
    if not path:
        raise HTTPException(status_code=404, detail="Figure not found")
    return FileResponse(path)

@app.get("/chat/documents/{doc_id}/figures-status")
async def figures_status(doc_id: int):
    return FIGURE_JOBS.get(doc_id, {"state": "unknown"})

@app.post("/chat/message")
async def chat_message(req: ChatRequest, db=Depends(get_db)):
    config = ProviderConfig(provider=req.provider, api_key=req.api_key, model_name=req.model_name)
    try:
        # 1. Retrieve history
        history = await get_chat_history(req.session_id)

        # 2. Run RAG Agent
        agent = RAGAgent(config, req.session_id)
        answer = await agent.chat(req.text, history, req.tavily_api_key)

        # Keep only [[figure:ID]] markers that belong to this session; attach those figures
        answer, figs = finalize_answer(db, req.session_id, answer)

        # 3. Save interaction
        await save_chat_message(req.session_id, "user", req.text)
        await save_chat_message(req.session_id, "assistant", answer, citations=json.dumps(figs) if figs else None)

        return {"answer": answer, "figures": figs}
    except RateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        logger.error(f"ERROR in chat: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/chat/sessions/{session_id}/messages")
async def get_messages(session_id: str, db=Depends(get_db)):
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        .all()
    )
    def _figs(m):
        try:
            v = json.loads(m.citations) if m.citations else []
            return v if isinstance(v, list) else []
        except Exception:
            return []

    return [{"id": m.id, "role": m.role.value, "content": m.content, "figures": _figs(m), "created_at": m.created_at.isoformat() if m.created_at else None} for m in messages]

@app.delete("/chat/sessions/{session_id}")
async def delete_session(session_id: str, db=Depends(get_db)):
    """Deletes a chat session along with all its messages, documents, and files."""
    try:
        session = db.query(UserSession).filter(UserSession.session_id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Delete physical document files
        docs = db.query(Document).filter(Document.session_id == session_id).all()
        for doc in docs:
            if doc.file_path and os.path.exists(doc.file_path):
                try:
                    os.remove(doc.file_path)
                except OSError as e:
                    logger.warning(f"Failed to remove file {doc.file_path}: {e}")
            db.delete(doc)

        delete_session_figures(db, session_id)
        try:
            get_vector_collection().delete(where={"session_id": session_id})
        except Exception as e:
            logger.warning(f"Failed to remove Chroma vectors for session {session_id}: {e}")

        # Delete messages and research logs
        db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete(synchronize_session=False)
        db.query(ResearchLog).filter(ResearchLog.session_id == session_id).delete(synchronize_session=False)
        db.query(GraphSnapshot).filter(GraphSnapshot.session_id == session_id).delete(synchronize_session=False)

        # Delete session
        db.delete(session)
        db.commit()
        return {"status": "success", "message": "Session deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/chat/sessions/{session_id}/messages")
async def clear_session_messages(session_id: str, db=Depends(get_db)):
    """Clears all chat messages from a session while keeping documents intact."""
    try:
        db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete(synchronize_session=False)
        db.commit()
        return {"status": "success", "message": "Chat history cleared successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error clearing messages for session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/chat/messages/{message_id}")
async def delete_single_message(message_id: int, db=Depends(get_db)):
    """Deletes an individual chat message by ID."""
    try:
        msg = db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found")
        db.delete(msg)
        db.commit()
        return {"status": "success", "message": "Message deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting message {message_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Graph Visualization & Traversal Endpoints ---

@app.post("/api/graph/generate")
async def generate_graph(req: GraphGenerateRequest):
    """
    Accepts paper metadata and user keys, triggers recursive citation/reference
    traversal up to max_nodes (50), computes shortest-path graph distances,
    stores the graph snapshot in the database, and returns nodes and edges.
    """
    session_id = req.session_id or str(uuid.uuid4())
    search_target = req.paper_id or req.title or req.query
    if not search_target:
        raise HTTPException(status_code=400, detail="Must provide 'paper_id', 'title', or 'query' to generate graph")

    # Cap max_nodes to prevent resource exhaustion
    max_nodes = min(req.max_nodes or 50, 200)

    try:
        service = GraphService(
            s2_api_key=req.s2_api_key,
            tavily_api_key=req.tavily_api_key or settings.TAVILY_API_KEY
        )

        graph_data = await service.generate_citation_graph(
            query=search_target,
            title=req.title,
            paper_id=req.paper_id,
            max_nodes=max_nodes
        )

        # Store snapshot in the database
        db = SessionLocal()
        try:
            snapshot = GraphSnapshot(
                session_id=session_id,
                root_paper_id=graph_data.get("root_paper_id"),
                nodes=json.dumps(graph_data.get("nodes", [])),
                edges=json.dumps(graph_data.get("edges", [])),
                metadata_json=json.dumps({
                    "total_nodes": graph_data.get("total_nodes", 0),
                    "total_edges": graph_data.get("total_edges", 0),
                    "search_target": search_target
                })
            )
            db.add(snapshot)
            db.commit()
            db.refresh(snapshot)
        except Exception as db_error:
            db.rollback()
            logger.error(f"Database error saving graph snapshot: {str(db_error)}")
            raise
        finally:
            db.close()

        return {
            "session_id": session_id,
            "root_paper_id": graph_data.get("root_paper_id"),
            "nodes": graph_data.get("nodes", []),
            "edges": graph_data.get("edges", []),
            "total_nodes": graph_data.get("total_nodes", 0),
            "total_edges": graph_data.get("total_edges", 0)
        }
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        logger.error(f"ERROR in generate_graph: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/graph/session")
async def delete_graph_session(req: Optional[DeleteGraphSessionRequest] = None, session_id: Optional[str] = None, db=Depends(get_db)):
    """
    Instantly deletes the current session's graph records from the database.
    """
    target_session_id = (req.session_id if req and req.session_id else session_id)
    if not target_session_id:
        raise HTTPException(status_code=400, detail="session_id is required to delete graph records")

    try:
        deleted_count = db.query(GraphSnapshot).filter(GraphSnapshot.session_id == target_session_id).delete()
        db.commit()
        return {
            "status": "success",
            "message": f"Successfully deleted {deleted_count} graph record(s) for session {target_session_id}"
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete graph session {target_session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete graph session: {str(e)}")

@app.get("/api/graph/session/{session_id}")
async def get_graph_session(session_id: str, db=Depends(get_db)):
    """
    Retrieve the latest graph snapshot for a given session.
    """
    snapshot = db.query(GraphSnapshot).filter(
        GraphSnapshot.session_id == session_id
    ).order_by(GraphSnapshot.created_at.desc()).first()

    if not snapshot:
        raise HTTPException(status_code=404, detail="No graph snapshot found for this session")

    return {
        "session_id": snapshot.session_id,
        "root_paper_id": snapshot.root_paper_id,
        "nodes": json.loads(snapshot.nodes or "[]"),
        "edges": json.loads(snapshot.edges or "[]"),
        "metadata": json.loads(snapshot.metadata_json or "{}"),
        "created_at": snapshot.created_at
    }


from .dashboards import router as dashboards_router
app.include_router(dashboards_router)
from .dashboards_ai import router as dashboards_ai_router
app.include_router(dashboards_ai_router)


# Desktop app: the backend also serves the exported frontend (same origin, no CORS, no fixed API URL).
# Registered LAST so every API route above takes precedence. Unset on web/Docker/dev.
_frontend_dir = os.environ.get("FRONTEND_DIR")
if _frontend_dir and os.path.isdir(_frontend_dir):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_frontend_dir, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
