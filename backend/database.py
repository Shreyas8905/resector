from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, Enum as SqlEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import enum
import chromadb
from chromadb.config import Settings as ChromaSettings
from .config import settings

Base = declarative_base()

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

class UserSession(Base):
    __tablename__ = "user_sessions"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True)
    title = Column(String, default="New Research Session")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    logs = relationship("ResearchLog", back_populates="session")
    messages = relationship("ChatMessage", back_populates="session")
    documents = relationship("Document", back_populates="session")

class ResearchLog(Base):
    __tablename__ = "research_logs"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("user_sessions.session_id"))
    tool_name = Column(String) # "sifter", "critique", "jargon"
    input_text = Column(Text)
    output_text = Column(Text)
    provider = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("UserSession", back_populates="logs")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("user_sessions.session_id"))
    role = Column(SqlEnum(MessageRole))
    content = Column(Text)
    citations = Column(Text) # JSON string of citations
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("UserSession", back_populates="messages")

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("user_sessions.session_id"))
    filename = Column(String)
    file_path = Column(String)
    status = Column(SqlEnum(DocStatus), default=DocStatus.UPLOADING)
    progress = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("UserSession", back_populates="documents")

class GraphSnapshot(Base):
    __tablename__ = "graph_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True)
    root_paper_id = Column(String, nullable=True)
    nodes = Column(Text)  # JSON-encoded nodes
    edges = Column(Text)  # JSON-encoded edges
    metadata_json = Column(Text, nullable=True)  # JSON-encoded metadata
    created_at = Column(DateTime, default=datetime.utcnow)


# PostgreSQL Setup
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

# ChromaDB Setup
_chroma_client = None

def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.HttpClient(
            host=settings.CHROMA_HOST,
            port=int(settings.CHROMA_PORT)
        )
    return _chroma_client

def get_vector_collection(collection_name="resector_research"):
    client = get_chroma_client()
    return client.get_or_create_collection(name=collection_name)

