from sqlalchemy import create_engine, event, Column, Integer, Float, String, Text, DateTime, ForeignKey, Enum as SqlEnum
from sqlalchemy.orm import DeclarativeBase, sessionmaker, relationship
from datetime import datetime, timezone
import enum
import chromadb
from chromadb.config import Settings as ChromaSettings
from .config import settings
import threading


class Base(DeclarativeBase):
    """Modern SQLAlchemy 2.0 declarative base."""
    pass


class DocStatus(enum.Enum):
    UPLOADING = "uploading"
    PARSING = "parsing"
    EMBEDDING = "embedding"
    COMPLETED = "completed"
    FAILED = "failed"


class MessageRole(enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


# NOTE: sqlite_autoincrement=True makes SQLite behave like Postgres sequences:
# IDs are never reused after a row is deleted. This matters because ChromaDB
# entries are keyed on these IDs (log_{id}, document_id).


class UserSession(Base):
    __tablename__ = "user_sessions"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True)
    title = Column(String, default="New Research Session")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    logs = relationship("ResearchLog", back_populates="session", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="session", cascade="all, delete-orphan")


class ResearchLog(Base):
    __tablename__ = "research_logs"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("user_sessions.session_id"), index=True)
    tool_name = Column(String)  # "sifter", "critique", "jargon"
    input_text = Column(Text)
    output_text = Column(Text)
    provider = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("UserSession", back_populates="logs")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("user_sessions.session_id"), index=True)
    role = Column(SqlEnum(MessageRole))
    content = Column(Text)
    citations = Column(Text)  # JSON string of citations
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("UserSession", back_populates="messages")


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("user_sessions.session_id"), index=True)
    filename = Column(String)
    file_path = Column(String)
    status = Column(SqlEnum(DocStatus), default=DocStatus.UPLOADING)
    progress = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("UserSession", back_populates="documents")


class GraphSnapshot(Base):
    __tablename__ = "graph_snapshots"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True)
    root_paper_id = Column(String, nullable=True)
    nodes = Column(Text)  # JSON-encoded nodes
    edges = Column(Text)  # JSON-encoded edges
    metadata_json = Column(Text, nullable=True)  # JSON-encoded metadata
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Figure(Base):
    __tablename__ = "figures"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True)
    document_id = Column(Integer, index=True)
    filename = Column(String, nullable=True)        # paper the figure came from
    label = Column(String, index=True)              # "Figure 3"
    page = Column(Integer)
    caption = Column(Text)
    kind = Column(String, nullable=True)            # bar_chart, architecture_diagram, ...
    description = Column(Text, nullable=True)       # vision-model description
    facts = Column(Text, nullable=True)             # newline-separated key facts
    image_path = Column(String)                     # relative to DATA_DIR
    fallback = Column(Integer, default=0)           # 1 = whole-page render (crop not found)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ---- Research Dashboard (canvas) -------------------------------------------------------
# Additive tables only. A dashboard owns a hidden UserSession so uploads, Chroma indexing and
# figure extraction reuse the existing pipeline unchanged.
class Dashboard(Base):
    __tablename__ = "dashboards"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True, index=True)
    dash_id = Column(String, unique=True, index=True)
    session_id = Column(String, index=True)          # backing UserSession.session_id
    project = Column(String, default="")             # free-text project / paper this belongs to
    title = Column(String, default="Untitled dashboard")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class CanvasNode(Base):
    __tablename__ = "canvas_nodes"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True)
    dashboard_id = Column(Integer, ForeignKey("dashboards.id", ondelete="CASCADE"), index=True)
    node_id = Column(String, index=True)             # client-generated id
    type = Column(String)                            # paper|excerpt|note|claim|frame
    x = Column(Float, default=0)
    y = Column(Float, default=0)
    width = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    data = Column(Text, default="{}")                # JSON


class CanvasEdge(Base):
    __tablename__ = "canvas_edges"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True)
    dashboard_id = Column(Integer, ForeignKey("dashboards.id", ondelete="CASCADE"), index=True)
    edge_id = Column(String, index=True)
    source = Column(String)
    target = Column(String)
    source_handle = Column(String, nullable=True)
    target_handle = Column(String, nullable=True)
    kind = Column(String, default="related")
    label = Column(String, default="")


class Excerpt(Base):
    __tablename__ = "excerpts"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True)
    dashboard_id = Column(Integer, ForeignKey("dashboards.id", ondelete="CASCADE"), index=True)
    document_id = Column(Integer, index=True)
    page = Column(Integer)                           # 1-based
    kind = Column(String, default="text")            # text | area
    rects = Column(Text, default="[]")               # JSON, fractions of the page
    quote = Column(Text, default="")
    prefix = Column(Text, default="")
    suffix = Column(Text, default="")
    image_path = Column(String, nullable=True)       # area excerpts: cropped PNG, relative to DATA_DIR
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class CanvasComment(Base):
    __tablename__ = "canvas_comments"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True)
    dashboard_id = Column(Integer, ForeignKey("dashboards.id", ondelete="CASCADE"), index=True)
    node_id = Column(String, nullable=True, index=True)   # null = dashboard-level
    author = Column(String, default="You")
    text = Column(Text, default="")
    resolved = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AiUsage(Base):
    """Token usage of AI actions on a dashboard (for the cost meter). Additive table."""
    __tablename__ = "ai_usage"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True)
    dashboard_id = Column(Integer, ForeignKey("dashboards.id", ondelete="CASCADE"), index=True)
    action = Column(String)                 # ask | summarize | compare
    provider = Column(String, nullable=True)
    model = Column(String, nullable=True)
    tokens_in = Column(Integer, default=0)
    tokens_out = Column(Integer, default=0)
    estimated = Column(Integer, default=0)  # 1 = provider gave no usage numbers, we estimated
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class WireSuggestion(Base):
    """A link the agent proposes between two items (paper-paper or claim-paper). Additive table.
    status: pending | accepted | dismissed | none (judged, no relation: kept so it is not paid for twice)."""
    __tablename__ = "wire_suggestions"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True)
    dashboard_id = Column(Integer, ForeignKey("dashboards.id", ondelete="CASCADE"), index=True)
    pair_key = Column(String, index=True)
    a_kind = Column(String)                  # paper | claim
    a_ref = Column(String)                   # document id, or canvas node id for a claim
    b_kind = Column(String)
    b_ref = Column(String)
    relation = Column(String, default="related")
    summary = Column(Text, default="")
    evidence = Column(Text, default="[]")    # JSON list of cites {n, document_id, filename, page, quote, rects}
    confidence = Column(Float, default=0)
    status = Column(String, default="pending")
    run_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AgentRun(Base):
    """One run of the wiring or gap agent: progress, cost and (for gaps) the result. Additive table."""
    __tablename__ = "agent_runs"
    __table_args__ = {"sqlite_autoincrement": True}
    id = Column(Integer, primary_key=True)
    dashboard_id = Column(Integer, ForeignKey("dashboards.id", ondelete="CASCADE"), index=True)
    kind = Column(String)                    # wire | gaps
    status = Column(String, default="running")   # running | done | failed | cancelled
    total = Column(Integer, default=0)
    done = Column(Integer, default=0)
    found = Column(Integer, default=0)
    tokens_in = Column(Integer, default=0)
    tokens_out = Column(Integer, default=0)
    message = Column(Text, default="")
    result = Column(Text, nullable=True)     # JSON (gap findings)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime, nullable=True)


# SQLite Setup
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_conn, _record):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")   # background PDF jobs won't block requests
    cur.execute("PRAGMA busy_timeout=30000")
    cur.execute("PRAGMA foreign_keys=ON")    # SQLite ignores FKs unless enabled
    cur.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    Base.metadata.create_all(bind=engine)


# ChromaDB Setup - thread-safe singleton
_chroma_client = None
_chroma_lock = threading.Lock()


def get_chroma_client():
    """Thread-safe singleton for ChromaDB client."""
    global _chroma_client
    if _chroma_client is None:
        with _chroma_lock:
            # Double-check locking pattern
            if _chroma_client is None:
                _chroma_client = chromadb.HttpClient(
                    host=settings.CHROMA_HOST,
                    port=int(settings.CHROMA_PORT)
                )
    return _chroma_client


def get_vector_collection(collection_name="resector_research"):
    client = get_chroma_client()
    return client.get_or_create_collection(name=collection_name)

def get_chroma_client():
    """Thread-safe singleton. Embedded by default; set CHROMA_MODE=http to use a server."""
    global _chroma_client
    if _chroma_client is None:
        with _chroma_lock:
            if _chroma_client is None:
                if settings.CHROMA_MODE == "http":
                    _chroma_client = chromadb.HttpClient(
                        host=settings.CHROMA_HOST,
                        port=int(settings.CHROMA_PORT),
                    )
                else:
                    from pathlib import Path
                    Path(settings.CHROMA_PATH).mkdir(parents=True, exist_ok=True)
                    _chroma_client = chromadb.PersistentClient(
                        path=settings.CHROMA_PATH,
                        settings=ChromaSettings(anonymized_telemetry=False),
                    )
    return _chroma_client


def warm_up_embedding_model():
    """Blocks until Chroma is ready and the embedding model is downloaded and loaded."""
    from pathlib import Path
    from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

    # Optional: use a model folder shipped with the app instead of ~/.cache/chroma
    if settings.EMBEDDING_MODEL_DIR:
        from chromadb.utils.embedding_functions.onnx_mini_lm_l6_v2 import ONNXMiniLM_L6_V2
        ONNXMiniLM_L6_V2.DOWNLOAD_PATH = Path(settings.EMBEDDING_MODEL_DIR)

    get_chroma_client().heartbeat()
    get_vector_collection()
    DefaultEmbeddingFunction()(["warm up"])