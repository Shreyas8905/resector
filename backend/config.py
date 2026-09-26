from pydantic_settings import BaseSettings, SettingsConfigDict
import os
from pathlib import Path

# Get the directory where config.py is located
BASE_DIR = Path(__file__).resolve().parent

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://resector_user:resector_password@localhost:5432/resector_db")
    CHROMA_HOST: str = os.getenv("CHROMA_HOST", "localhost")
    CHROMA_PORT: str = os.getenv("CHROMA_PORT", "5000")
    TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "")

    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, ".env"),
        env_file_encoding='utf-8',
        extra='ignore'
    )

settings = Settings()
