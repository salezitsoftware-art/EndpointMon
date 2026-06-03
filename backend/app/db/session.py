from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from ..core.config import get_settings
import os


# Try to read settings via get_settings(); if that fails, fall back to environment variables.
try:
    settings = get_settings()
    database_url = getattr(settings, "database_url", None)
except Exception:
    database_url = os.getenv("DATABASE_URL")

if not database_url:
    database_url = "sqlite+aiosqlite:///./endpointwatch.db"

engine = create_async_engine(database_url, future=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
