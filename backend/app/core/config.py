import os
from typing import Optional

# Try to use pydantic-settings (Pydantic v2) or fallback to pydantic BaseSettings (v1).
BaseSettings = None
try:
    from pydantic_settings import BaseSettings  # type: ignore
except Exception:
    try:
        from pydantic import BaseSettings  # type: ignore
    except Exception:
        BaseSettings = None


if BaseSettings is not None:
    class Settings(BaseSettings):
        database_url: str = "sqlite+aiosqlite:///./endpointwatch.db"
        api_key: str = "change_me"
        secret_key: str = "change_me"
        ai_provider: str = "auto"
        ai_model: str = "gpt-4o-mini"
        openai_api_key: str = ""
        openai_base_url: str = "https://api.openai.com/v1"
        gemini_api_key: str = ""
        gemini_base_url: str = "https://generativelanguage.googleapis.com/v1"

        class Config:
            env_file = ".env"
            env_file_encoding = "utf-8"


    def get_settings() -> Settings:
        return Settings()
else:
    # Minimal fallback when pydantic is not available/usable in the environment.
    class Settings:
        def __init__(self, database_url: Optional[str] = None, api_key: Optional[str] = None):
            self.database_url = database_url or os.getenv("DATABASE_URL") or "sqlite+aiosqlite:///./endpointwatch.db"
            self.api_key = api_key or os.getenv("API_KEY") or "change_me"
            self.secret_key = os.getenv("SECRET_KEY") or "change_me"


    def get_settings() -> Settings:
        return Settings()
