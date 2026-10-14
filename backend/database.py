from sqlalchemy import create_engine, event, Column, Integer, String, Text, DateTime, ForeignKey, Enum as SqlEnum
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
