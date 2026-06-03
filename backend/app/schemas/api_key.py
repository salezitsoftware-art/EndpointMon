from datetime import datetime

from pydantic import BaseModel, Field


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)


class ApiKeyCreateResponse(BaseModel):
    id: int
    name: str
    key_prefix: str
    api_key: str
    is_active: bool
    created_at: datetime


class ApiKeyItemResponse(BaseModel):
    id: int
    name: str
    key_prefix: str
    is_active: bool
    created_at: datetime
    revoked_at: datetime | None
