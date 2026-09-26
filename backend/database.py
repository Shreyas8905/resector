from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import chromadb
from chromadb.config import Settings as ChromaSettings
from .config import settings

Base = declarative_base()

class UserSession(Base):
    __tablename__ = "user_sessions"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    logs = relationship("ResearchLog", back_populates="session")

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

# PostgreSQL Setup
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

# ChromaDB Setup
chroma_client = chromadb.HttpClient(
    host=settings.CHROMA_HOST,
    port=int(settings.CHROMA_PORT)
)

def get_vector_collection(collection_name="resector_research"):
    return chroma_client.get_or_create_collection(name=collection_name)
