from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import os
import uuid
import sqlalchemy
from typing import List, Optional
from pydantic import BaseModel

from .database import init_db, SessionLocal, ResearchLog, get_vector_collection, UserSession, Document, ChatMessage, GraphSnapshot
from .tools import ToolLogic, ResearchRequest, ResearchResponse, log_research
from .provider_factory import ProviderConfig, ProviderFactory
from .config import settings, RateLimitError
from .services.pdf_processor import PDFProcessor
from .services.rag_agent import RAGAgent, get_chat_history, save_chat_message
from .services.graph_service import GraphService
import json

app = FastAPI(title="Resector Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    return {"status": "healthy", "database": settings.DATABASE_URL}

# --- Original Tool Endpoints ---

@app.post("/process/sifter", response_model=ResearchResponse)
async def process_sifter(req: ResearchRequest):
    config = ProviderConfig(provider=req.provider, api_key=req.api_key, model_name=req.model_name)
    try:
        output = await ToolLogic.sifter(config, req.text)
        await log_research("sifter", req.text, output, req.provider)
        return ResearchResponse(output=output, provider=req.provider)
    except Exception as e:
        print(f"ERROR in sifter: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process/critique", response_model=ResearchResponse)
async def process_critique(req: ResearchRequest):
    config = ProviderConfig(provider=req.provider, api_key=req.api_key, model_name=req.model_name)
    try:
        output = await ToolLogic.critique(config, req.text, req.severity)
        await log_research("critique", req.text, output, req.provider)
        return ResearchResponse(output=output, provider=req.provider)
    except Exception as e:
        print(f"ERROR in critique: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process/jargon", response_model=ResearchResponse)
async def process_jargon(req: ResearchRequest):
    config = ProviderConfig(provider=req.provider, api_key=req.api_key, model_name=req.model_name)
    try:
        output = await ToolLogic.jargon(config, req.text)
        await log_research("jargon", req.text, output, req.provider)
        return ResearchResponse(output=output, provider=req.provider)
    except Exception as e:
        print(f"ERROR in jargon: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/search")
async def search_research(request: dict):
    query = request.get("query", "")
    if not query:
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
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/chat/documents/{session_id}")
async def list_documents(session_id: str):
    db = SessionLocal()
    try:
        docs = db.query(Document).filter(Document.session_id == session_id).all()
        return [{"id": d.id, "filename": d.filename, "status": d.status.value, "progress": d.progress} for d in docs]
    finally:
        db.close()

@app.delete("/chat/documents/{doc_id}")
async def delete_document(doc_id: int):
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        session_id = doc.session_id
        file_path = doc.file_path

        db.delete(doc)
        db.commit()

        # Remove file from disk
        if os.path.exists(file_path):
            os.remove(file_path)

        # Note: In a production app, we'd also remove the chunks from ChromaDB
        # using the document_id in metadata. For now, we remove the record.

        return {"message": "Document deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/chat/sessions")
async def create_session(req: CreateSessionRequest):
    db = SessionLocal()
    try:
        session = UserSession(session_id=str(uuid.uuid4()), title=req.title)
        db.add(session)
        db.commit()
        db.refresh(session)
        return {"session_id": session.session_id}
    finally:
        db.close()

@app.get("/chat/sessions")
async def list_sessions():
    db = SessionLocal()
    try:
        sessions = db.query(UserSession).all()
        return [{"id": s.session_id, "title": s.title, "updated_at": s.updated_at} for s in sessions]
    finally:
        db.close()

@app.post("/chat/upload")
async def upload_pdf(
    background_tasks: BackgroundTasks,
    session_id: str,
    files: List[UploadFile] = File(...)
):
    db = SessionLocal()
    try:
        upload_folder = "uploads"
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder)

        doc_ids = []
        for file in files:
            file_path = os.path.join(upload_folder, f"{uuid.uuid4()}_{file.filename}")
            with open(file_path, "wb") as f:
                f.write(await file.read())

            doc = Document(session_id=session_id, filename=file.filename, file_path=file_path)
            db.add(doc)
            db.commit()
            doc_ids.append(doc.id)

        # Start background processing for each file
        processor = PDFProcessor(session_id=session_id)
        for doc_id in doc_ids:
            doc_record = db.query(Document).filter(Document.id == doc_id).first()
            background_tasks.add_task(processor.process_and_index, doc_id, doc_record.file_path)

        return {"task_id": str(uuid.uuid4()), "doc_ids": doc_ids}
    finally:
        db.close()

@app.get("/chat/tasks/{task_id}")
async def get_task_status(task_id: str):
    db = SessionLocal()
    try:
        docs = db.query(Document).all()
        if not docs:
            return {"status": "no_documents", "progress": 0}

        total_progress = sum(d.progress for d in docs) / len(docs)
        return {"status": "processing", "progress": int(total_progress)}
    finally:
        db.close()

@app.post("/chat/message")
async def chat_message(req: ChatRequest):
    config = ProviderConfig(provider=req.provider, api_key=req.api_key, model_name=req.model_name)
    try:
        # 1. Retrieve history
        history = await get_chat_history(req.session_id)

        # 2. Run RAG Agent
        agent = RAGAgent(config, req.session_id)
        answer = await agent.chat(req.text, history, req.tavily_api_key)

        # 3. Save interaction
        await save_chat_message(req.session_id, "user", req.text)
        await save_chat_message(req.session_id, "assistant", answer)

        return {"answer": answer}
    except Exception as e:
        if isinstance(e, RateLimitError):
            raise HTTPException(status_code=429, detail=str(e))
        print(f"ERROR in chat: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/chat/sessions/{session_id}/messages")
async def get_messages(session_id: str):
    db = SessionLocal()
    try:
        messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
        return [{"role": m.role.value, "content": m.content} for m in messages]
    finally:
        db.close()

# --- Graph Visualization & Traversal Endpoints ---

@app.post("/api/graph/generate")
async def generate_graph(req: GraphGenerateRequest):
    """
    Accepts paper metadata and user keys, triggers recursive citation/reference
    traversal up to max_nodes (50), computes shortest-path graph distances,
    stores the graph snapshot in PostgreSQL, and returns nodes and edges.
    """
    session_id = req.session_id or str(uuid.uuid4())
    search_target = req.paper_id or req.title or req.query
    if not search_target:
        raise HTTPException(status_code=400, detail="Must provide 'paper_id', 'title', or 'query' to generate graph")

    try:
        service = GraphService(
            s2_api_key=req.s2_api_key,
            tavily_api_key=req.tavily_api_key or settings.TAVILY_API_KEY
        )
        
        graph_data = await service.generate_citation_graph(
            query=search_target,
            title=req.title,
            paper_id=req.paper_id,
            max_nodes=req.max_nodes or 50
        )

        # Store snapshot in PostgreSQL
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
        print(f"ERROR in generate_graph: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/graph/session")
async def delete_graph_session(req: Optional[DeleteGraphSessionRequest] = None, session_id: Optional[str] = None):
    """
    Instantly deletes the current session's graph records from the database.
    """
    target_session_id = (req.session_id if req and req.session_id else session_id)
    if not target_session_id:
        raise HTTPException(status_code=400, detail="session_id is required to delete graph records")

    db = SessionLocal()
    try:
        deleted_count = db.query(GraphSnapshot).filter(GraphSnapshot.session_id == target_session_id).delete()
        db.commit()
        return {
            "status": "success",
            "message": f"Successfully deleted {deleted_count} graph record(s) for session {target_session_id}"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete graph session: {str(e)}")
    finally:
        db.close()

@app.get("/api/graph/session/{session_id}")
async def get_graph_session(session_id: str):
    """
    Retrieve the latest graph snapshot for a given session.
    """
    db = SessionLocal()
    try:
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
    finally:
        db.close()


@app.on_event("startup")
async def startup_event():
    init_db()
    # Force sync the database schema for development
    db = SessionLocal()
    try:
        # Check if 'title' column exists in user_sessions
        # This avoids the "UndefinedColumn" error without requiring a full reset
        db.execute(sqlalchemy.text("ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS title VARCHAR"))
        db.execute(sqlalchemy.text("ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE"))
        db.commit()
        print("Database schema synchronized successfully.")
    except Exception as e:
        print(f"Schema sync notice: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
