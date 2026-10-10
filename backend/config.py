import os
from pydantic_settings import BaseSettings
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    # Database URL - prefer environment variable in production
    # Default is for local development only
    DATABASE_URL: str = os.environ.get(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/resector"
    )
    CHROMA_PORT: int = int(os.environ.get("CHROMA_PORT", "5000"))
    CHROMA_HOST: str = os.environ.get("CHROMA_HOST", "localhost")
    TAVILY_API_KEY: str = os.environ.get("TAVILY_API_KEY", "")

    class Config:
        env_file = os.path.join(BASE_DIR, ".env")
        env_file_encoding = 'utf-8'


settings = Settings()


class RateLimitError(Exception):
    """Exception raised when an LLM provider rate limit is hit."""
    pass
