from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.security import verify_api_key
from ..db.session import get_db
from ..models import Machine, Telemetry, Alert
from ..schemas.machine import MachineAnalysisResponse, MachineDetail, MachineSummary, TelemetryHistoryPoint, PaginatedMachines
from ..services.ai_analysis import analyze_machine, minutes_since_last_seen

router = APIRouter()


def _machine_status(last_seen: datetime | None, offline_after_minutes: int = 15) -> str:
    if not last_seen:
        return "offline"
    now = datetime.now(timezone.utc)
    last_seen_utc = last_seen if last_seen.tzinfo else last_seen.replace(tzinfo=timezone.utc)
    delta = now - last_seen_utc
    if delta <= timedelta(minutes=15):
        return "online"
    if delta <= timedelta(minutes=60):
        return "delayed"
    return "offline"


def _compute_health(latest_metrics: dict | None, last_seen: datetime | None, alert_count: int) -> tuple[str, int]:
    # Default healthy
    if not latest_metrics:
        score = max(0, 100 - min(alert_count * 5, 50))
        status = "Healthy" if score >= 75 else ("Warning" if score >= 40 else "Critical")
        return status, score

    cpu = float(latest_metrics.get("cpu") or 0)
    ram = float(latest_metrics.get("ram") or 0)
    disk = float(latest_metrics.get("disk") or 0)
    latency = float(latest_metrics.get("latency_ms") or 0)

    # Status rules
    if cpu > 95 or ram > 95 or disk > 95 or latency > 250:
        status = "Critical"
    elif cpu > 80 or ram > 85 or disk > 85 or latency > 150:
        status = "Warning"
    else:
        status = "Healthy"

    # Compute score (0-100). Weights: cpu 25%, ram 25%, disk 25%, latency 15%, alerts 10%
    latency_pct = min((latency / 500) * 100, 100)
    alerts_pct = min(alert_count * 10, 100)
    penalty = (cpu * 0.25) + (ram * 0.25) + (disk * 0.25) + (latency_pct * 0.15) + (alerts_pct * 0.10)
    score = int(max(0, round(100 - penalty)))
    return status, score


@router.get("/machines", response_model=PaginatedMachines)
async def list_machines(
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_api_key),
    page: int = 1,
    per_page: int = 25,
):
    page = max(1, page)
    per_page = min(max(1, per_page), 200)

    total_result = await db.execute(select(func.count()).select_from(Machine))
    total = total_result.scalar_one()

    offset = (page - 1) * per_page
    result = await db.execute(select(Machine).order_by(Machine.hostname.asc()).offset(offset).limit(per_page))
    machines = result.scalars().all()

    summaries = []
    for m in machines:
        latest_result = await db.execute(
            select(Telemetry).where(Telemetry.machine_id == m.id).order_by(Telemetry.created_at.desc()).limit(1)
        )
        latest = latest_result.scalars().first()
        alert_result = await db.execute(select(Alert).where(Alert.machine_id == m.id).where(Alert.is_resolved == False))
        unresolved = len(alert_result.scalars().all())
        health_status, health_score = _compute_health(latest.metrics if latest else None, m.last_seen, unresolved)

        summaries.append(
            MachineSummary(
                id=m.id,
                hostname=m.hostname,
                os_version=m.os_version or getattr(m, "windows_version", None),
                last_seen=m.last_seen,
                status=_machine_status(m.last_seen),
                health_status=health_status,
                health_score=health_score,
                username=getattr(m, "username", None),
                manufacturer=getattr(m, "manufacturer", None),
                model=getattr(m, "model", None),
                cpu_name=getattr(m, "cpu_name", None),
                ram_total_bytes=getattr(m, "ram_total_bytes", None),
                serial_number=getattr(m, "serial_number", None),
                gpu_name=getattr(m, "gpu_name", None),
                disk_size_bytes=getattr(m, "disk_size_bytes", None),
                windows_license_key=m.inventory.get("windows_license_key") if m.inventory else None,
                oem_activation_status=m.inventory.get("oem_activation_status") if m.inventory else None,
                local_active_accounts=m.inventory.get("local_active_accounts") if m.inventory else None,
                ip_address=m.inventory.get("ip_address") if m.inventory else None,
                mac_address=m.inventory.get("mac_address") if m.inventory else None,
                last_boot_time=m.inventory.get("last_boot_time") if m.inventory else None,
                windows_license_channel=m.inventory.get("windows_license_channel") if m.inventory else None,
                os_architecture=m.inventory.get("os_architecture") if m.inventory else None,
                os_install_date=m.inventory.get("os_install_date") if m.inventory else None,
                latest_metrics=latest.metrics if latest else None,
            )
        )

    pages = (total + per_page - 1) // per_page
    return PaginatedMachines(items=summaries, total=total, page=page, per_page=per_page, pages=pages)


@router.get("/machines/{machine_id}", response_model=MachineDetail)
async def get_machine(
    machine_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_api_key),
):
    result = await db.execute(select(Machine).where(Machine.id == machine_id))
    machine = result.scalars().first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    latest_result = await db.execute(
        select(Telemetry)
        .where(Telemetry.machine_id == machine_id)
        .order_by(Telemetry.created_at.desc())
        .limit(1)
    )
    latest = latest_result.scalars().first()

    # count unresolved alerts
    alert_result = await db.execute(select(Alert).where(Alert.machine_id == machine_id).where(Alert.is_resolved == False))
    unresolved = len(alert_result.scalars().all())

    health_status, health_score = _compute_health(latest.metrics if latest else None, machine.last_seen, unresolved)

    last_seen_status = _machine_status(machine.last_seen)

    return MachineDetail(
        id=machine.id,
        hostname=machine.hostname,
        os_version=machine.os_version or getattr(machine, "windows_version", None),
        last_seen=machine.last_seen,
        status=last_seen_status,
        latest_metrics=latest.metrics if latest else None,
        inventory=machine.inventory if getattr(machine, 'inventory', None) else None,
        health_status=health_status,
        health_score=health_score,
        last_seen_status=last_seen_status,
    )


@router.get("/machines/{machine_id}/history", response_model=list[TelemetryHistoryPoint])
async def get_machine_history(
    machine_id: int,
    limit: int = 100,
    created_after: datetime | None = Query(None),
    created_before: datetime | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_api_key),
):
    machine_result = await db.execute(select(Machine).where(Machine.id == machine_id))
    machine = machine_result.scalars().first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    safe_limit = min(max(limit, 1), 1000)
    query = select(Telemetry).where(Telemetry.machine_id == machine_id)
    if created_after is not None:
        query = query.where(Telemetry.created_at >= created_after)
    if created_before is not None:
        query = query.where(Telemetry.created_at < created_before)

    history_result = await db.execute(query.order_by(Telemetry.created_at.desc()).limit(safe_limit))
    rows = history_result.scalars().all()
    rows.reverse()

    return [
        TelemetryHistoryPoint(
            id=t.id,
            timestamp=t.timestamp,
            created_at=t.created_at,
            metrics=t.metrics,
        )
        for t in rows
    ]


@router.post("/machines/{machine_id}/analysis", response_model=MachineAnalysisResponse)
async def analyze_machine_route(
    machine_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_api_key),
):
    machine_result = await db.execute(select(Machine).where(Machine.id == machine_id))
    machine = machine_result.scalars().first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    latest_result = await db.execute(
        select(Telemetry)
        .where(Telemetry.machine_id == machine_id)
        .order_by(Telemetry.created_at.desc())
        .limit(1)
    )
    latest = latest_result.scalars().first()

    alert_result = await db.execute(
        select(Alert.message)
        .where(Alert.machine_id == machine_id)
        .where(Alert.is_resolved.is_(False))
        .order_by(Alert.created_at.desc())
        .limit(10)
    )
    alerts = [row[0] for row in alert_result.all() if row and row[0]]

    analysis = await analyze_machine(
        hostname=machine.hostname,
        latest_metrics=latest.metrics if latest else None,
        inventory=machine.inventory if getattr(machine, "inventory", None) else None,
        alerts=alerts,
        last_seen_minutes=minutes_since_last_seen(machine.last_seen),
    )

    return MachineAnalysisResponse(
        machine_id=machine.id,
        hostname=machine.hostname,
        provider=analysis["provider"],
        model=analysis.get("model"),
        generated_at=datetime.now(timezone.utc),
        summary=analysis["summary"],
        severity=analysis["severity"],
        confidence=analysis["confidence"],
        signals=analysis["signals"],
        recommendations=analysis["recommendations"],
        ai_enabled=analysis["ai_enabled"],
    )
