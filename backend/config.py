import os
from pathlib import Path

from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

# All persistent data lives here (override with the DATA_DIR env var)
DATA_DIR = Path(os.environ.get("DATA_DIR", PROJECT_ROOT / "user_data")).resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
_BUNDLED_MODEL = BASE_DIR / "models" / "all-MiniLM-L6-v2"


class Settings(BaseSettings):
    # Default is a SQLite file in user_data/; set DATABASE_URL to override.
    DATABASE_URL: str = os.environ.get(
        "DATABASE_URL",
        f"sqlite:///{(DATA_DIR / 'resector.db').as_posix()}",
    )
    CHROMA_PORT: int = int(os.environ.get("CHROMA_PORT", "5000"))
    CHROMA_HOST: str = os.environ.get("CHROMA_HOST", "localhost")
    TAVILY_API_KEY: str = os.environ.get("TAVILY_API_KEY", "")
    CHROMA_MODE: str = os.environ.get("CHROMA_MODE", "embedded")   
    CHROMA_PATH: str = os.environ.get("CHROMA_PATH", str(DATA_DIR / "chroma"))
    EMBEDDING_MODEL_DIR: str = os.environ.get(
        "EMBEDDING_MODEL_DIR",
        str(_BUNDLED_MODEL) if (_BUNDLED_MODEL / "onnx.tar.gz").exists() else "",
    )
    TOOL_CHAR_BUDGET: int = int(os.environ.get("TOOL_CHAR_BUDGET", "0"))  # 0 = automatic per provider
    TOOL_MAX_PARTS: int = int(os.environ.get("TOOL_MAX_PARTS", "25"))     # cost guard for huge documents

    class Config:
        env_file = os.path.join(BASE_DIR, ".env")
        env_file_encoding = "utf-8"


settings = Settings()


class RateLimitError(Exception):
    """Exception raised when an LLM provider rate limit is hit."""

    pass
