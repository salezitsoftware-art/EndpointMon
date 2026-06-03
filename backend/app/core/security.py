import hashlib
import hmac
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_db
from ..models import ApiKey
from .config import get_settings


def hash_api_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def build_api_key_prefix(value: str) -> str:
    return value[:8]


def verify_admin_key(x_admin_key: str = Header(...)) -> None:
    settings = get_settings()
    if not hmac.compare_digest(x_admin_key, settings.secret_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin key")


async def verify_api_key(
    x_api_key: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> Optional[ApiKey]:
    settings = get_settings()

    if hmac.compare_digest(x_api_key, settings.api_key):
        return None

    key_hash = hash_api_key(x_api_key)
    stmt = select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active.is_(True)).limit(1)
    result = await db.execute(stmt)
    record = result.scalars().first()
    if not record:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    return record
