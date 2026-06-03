from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime


class TelemetryBase(BaseModel):
    hostname: str
    timestamp: Optional[str]
    metrics: Dict[str, Any]
    inventory: Optional[Dict[str, Any]] = None


class TelemetryCreate(TelemetryBase):
    pass


class TelemetryResponse(TelemetryBase):
    id: int
    created_at: Optional[datetime]

    class Config:
        from_attributes = True
