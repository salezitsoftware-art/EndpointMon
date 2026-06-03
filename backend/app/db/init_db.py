import asyncio
from .session import engine
from ..models.base import Base
from .. import models  # noqa: F401


async def init_db() -> None:
    """Create database tables using SQLAlchemy metadata. For dev only."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


if __name__ == "__main__":
    asyncio.run(init_db())
