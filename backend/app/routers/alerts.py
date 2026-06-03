from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.security import verify_api_key
from ..db.session import get_db
from ..models import Alert, Machine
from ..schemas.alert import AlertResponse

router = APIRouter()


@router.get("/alerts", response_model=list[AlertResponse])
async def list_alerts(
    active_only: bool = True,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_api_key),
):
    safe_limit = min(max(limit, 1), 1000)
    stmt = (
        select(Alert, Machine.hostname)
        .join(Machine, Alert.machine_id == Machine.id)
        .order_by(Alert.created_at.desc())
        .limit(safe_limit)
    )
    if active_only:
        stmt = stmt.where(Alert.is_resolved.is_(False))

    result = await db.execute(stmt)
    rows = result.all()

    return [
        AlertResponse(
            id=a.id,
            machine_id=a.machine_id,
            hostname=hostname,
            alert_type=a.alert_type,
            severity=a.severity,
            message=a.message,
            metric_name=a.metric_name,
            metric_value=a.metric_value,
            threshold=a.threshold,
            is_resolved=a.is_resolved,
            created_at=a.created_at,
            resolved_at=a.resolved_at,
        )
        for a, hostname in rows
    ]
