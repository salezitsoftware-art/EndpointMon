from datetime import datetime
from pydantic import BaseModel
from typing import List, Optional


class MachineAnalysisInDB(BaseModel):
    id: int
    machine_id: int
    provider: str
    model: Optional[str]
    generated_at: datetime
    summary: Optional[str]
    severity: Optional[str]
    confidence: Optional[int]
    signals: Optional[List[str]]
    recommendations: Optional[List[str]]
    ai_enabled: bool

    class Config:
        orm_mode = True
