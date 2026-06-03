from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..core.security import verify_api_key
from ..schemas.telemetry import TelemetryCreate, TelemetryResponse
from ..db.session import get_db
from ..models import Alert, Machine, Telemetry

router = APIRouter()

ALERT_THRESHOLDS = {
    "cpu": 85.0,
    "ram": 85.0,
    "gpu": 90.0,
    "latency_ms": 150.0,
    "packet_loss_pct": 5.0,
    "rdp_input_delay_ms": 100.0,
    "rdp_rtt_ms": 150.0,
}


def _to_float(value: object) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def build_alerts(machine_id: int, metrics: dict) -> list[Alert]:
    alerts: list[Alert] = []
    for metric_name, threshold in ALERT_THRESHOLDS.items():
        metric_value = _to_float(metrics.get(metric_name))
        if metric_value is None:
            continue
        if metric_value > threshold:
            message = f"High {metric_name}: {metric_value} (threshold {threshold})"
            alerts.append(
                Alert(
                    machine_id=machine_id,
                    alert_type=f"high_{metric_name}",
                    severity="warning",
                    message=message,
                    metric_name=metric_name,
                    metric_value=metric_value,
                    threshold=threshold,
                )
            )
    return alerts


@router.post("/telemetry", response_model=TelemetryResponse, status_code=201)
async def ingest_telemetry(payload: TelemetryCreate, db: AsyncSession = Depends(get_db), _=Depends(verify_api_key)):
    """Ingest telemetry from agents and persist to DB."""
    # ensure machine exists
    stmt = select(Machine).where(Machine.hostname == payload.hostname)
    result = await db.execute(stmt)
    machine = result.scalars().first()
    if not machine:
        machine = Machine(hostname=payload.hostname)
        db.add(machine)
        await db.flush()

    # parse timestamp if provided
    ts = None
    if payload.timestamp:
        try:
            ts = datetime.fromisoformat(payload.timestamp)
        except Exception:
            ts = None

    machine.last_seen = datetime.now(timezone.utc)

    # Persist inventory if provided
    inv = getattr(payload, "inventory", None)
    if inv:
        try:
            drift_messages = []

            # Check RAM drift
            new_ram = inv.get("ram_total_bytes")
            if new_ram and machine.ram_total_bytes and new_ram != machine.ram_total_bytes:
                old_gb = round(machine.ram_total_bytes / (1024**3), 2)
                new_gb = round(new_ram / (1024**3), 2)
                drift_messages.append(f"RAM size changed from {old_gb} GB to {new_gb} GB")

            # Check CPU drift
            new_cpu = inv.get("cpu_name")
            if new_cpu and machine.cpu_name and new_cpu != machine.cpu_name:
                drift_messages.append(f"CPU model changed from '{machine.cpu_name}' to '{new_cpu}'")

            # Check Disk drift
            new_disk_size = inv.get("disk_size_bytes")
            if new_disk_size and machine.disk_size_bytes and new_disk_size != machine.disk_size_bytes:
                old_disk_gb = round(machine.disk_size_bytes / (1024**3), 2)
                new_disk_gb = round(new_disk_size / (1024**3), 2)
                drift_messages.append(f"Disk size changed from {old_disk_gb} GB to {new_disk_gb} GB")

            # Check GPU drift
            new_gpu = inv.get("gpu_name")
            if new_gpu and machine.gpu_name and new_gpu != machine.gpu_name:
                drift_messages.append(f"GPU model changed from '{machine.gpu_name}' to '{new_gpu}'")

            # Save hardware drift alerts to DB
            for msg in drift_messages:
                db.add(
                    Alert(
                        machine_id=machine.id,
                        alert_type="hardware_drift",
                        severity="warning",
                        message=msg,
                        metric_name="inventory",
                        metric_value=None,
                        threshold=None,
                    )
                )

            # update top-level machine fields when present
            machine.username = inv.get("username") or machine.username
            machine.manufacturer = inv.get("manufacturer") or machine.manufacturer
            machine.model = inv.get("model") or machine.model
            machine.serial_number = inv.get("serial_number") or machine.serial_number
            machine.cpu_name = inv.get("cpu_name") or machine.cpu_name
            machine.cpu_cores = inv.get("cpu_cores") or machine.cpu_cores
            machine.cpu_threads = inv.get("cpu_threads") or machine.cpu_threads
            machine.ram_total_bytes = inv.get("ram_total_bytes") or machine.ram_total_bytes
            machine.gpu_name = inv.get("gpu_name") or machine.gpu_name
            machine.gpu_driver = inv.get("gpu_driver") or machine.gpu_driver
            machine.gpu_memory_bytes = inv.get("gpu_memory_bytes") or machine.gpu_memory_bytes
            machine.os_version = inv.get("windows_version") or inv.get("os_version") or machine.os_version
            machine.windows_version = inv.get("windows_version") or machine.windows_version
            machine.primary_disk = inv.get("primary_disk") or machine.primary_disk
            machine.disk_size_bytes = inv.get("disk_size_bytes") or machine.disk_size_bytes
            machine.network_adapter = inv.get("network_adapter") or machine.network_adapter
            machine.inventory = inv
        except Exception:
            pass

    telemetry = Telemetry(machine_id=machine.id, timestamp=ts, metrics=payload.metrics)
    db.add(telemetry)

    alerts = build_alerts(machine_id=machine.id, metrics=payload.metrics)
    for alert in alerts:
        db.add(alert)

    await db.commit()
    await db.refresh(telemetry)

    return TelemetryResponse(
        id=telemetry.id,
        hostname=payload.hostname,
        timestamp=payload.timestamp,
        metrics=payload.metrics,
        created_at=telemetry.created_at,
    )
