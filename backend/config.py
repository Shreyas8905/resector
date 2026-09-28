import os
from pydantic_settings import BaseSettings
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/resector"
    CHROMA_PORT: int = 5000
    CHROMA_HOST: str = "localhost"
    TAVILY_API_KEY: str = ""

    class Config:
        env_file = os.path.join(BASE_DIR, ".env")
        env_file_encoding = 'utf-8'

settings = Settings()

class RateLimitError(Exception):
    """Exception raised when an LLM provider rate limit is hit."""
    pass
