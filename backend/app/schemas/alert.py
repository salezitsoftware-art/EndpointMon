from datetime import datetime

from pydantic import BaseModel


class AlertResponse(BaseModel):
    id: int
    machine_id: int
    hostname: str | None
    alert_type: str
    severity: str
    message: str
    metric_name: str | None
    metric_value: float | None
    threshold: float | None
    is_resolved: bool
    created_at: datetime
    resolved_at: datetime | None
