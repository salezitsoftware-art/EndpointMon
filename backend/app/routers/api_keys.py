import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.security import build_api_key_prefix, hash_api_key, verify_admin_key
from ..db.session import get_db
from ..models import ApiKey
from ..schemas.api_key import ApiKeyCreateRequest, ApiKeyCreateResponse, ApiKeyItemResponse

router = APIRouter()


@router.get("/keys", response_model=list[ApiKeyItemResponse])
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_admin_key),
):
    result = await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    rows = result.scalars().all()
    return [
        ApiKeyItemResponse(
            id=row.id,
            name=row.name,
            key_prefix=row.key_prefix,
            is_active=row.is_active,
            created_at=row.created_at,
            revoked_at=row.revoked_at,
        )
        for row in rows
    ]


@router.post("/keys/generate", response_model=ApiKeyCreateResponse, status_code=201)
async def generate_api_key(
    payload: ApiKeyCreateRequest,
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_admin_key),
):
    raw_key = secrets.token_urlsafe(36)
    entry = ApiKey(
        name=payload.name,
        key_prefix=build_api_key_prefix(raw_key),
        key_hash=hash_api_key(raw_key),
        is_active=True,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    return ApiKeyCreateResponse(
        id=entry.id,
        name=entry.name,
        key_prefix=entry.key_prefix,
        api_key=raw_key,
        is_active=entry.is_active,
        created_at=entry.created_at,
    )


@router.post("/keys/{key_id}/revoke", response_model=ApiKeyItemResponse)
async def revoke_api_key(
    key_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_admin_key),
):
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="API key not found")

    row.is_active = False
    row.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)

    return ApiKeyItemResponse(
        id=row.id,
        name=row.name,
        key_prefix=row.key_prefix,
        is_active=row.is_active,
        created_at=row.created_at,
        revoked_at=row.revoked_at,
    )
