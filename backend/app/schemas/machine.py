from datetime import datetime
from typing import Any

from pydantic import BaseModel


class MachineSummary(BaseModel):
    id: int
    hostname: str
    os_version: str | None
    last_seen: datetime | None
    status: str
    health_status: str | None = None
    health_score: int | None = None
    username: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    cpu_name: str | None = None
    ram_total_bytes: int | None = None
    serial_number: str | None = None
    gpu_name: str | None = None
    disk_size_bytes: int | None = None
    windows_license_key: str | None = None
    oem_activation_status: str | None = None
    local_active_accounts: str | None = None
    ip_address: str | None = None
    mac_address: str | None = None
    last_boot_time: str | None = None
    windows_license_channel: str | None = None
    os_architecture: str | None = None
    os_install_date: str | None = None
    latest_metrics: dict[str, Any] | None = None


class TelemetryHistoryPoint(BaseModel):
    id: int
    timestamp: datetime | None
    created_at: datetime
    metrics: dict[str, Any]


class MachineDetail(BaseModel):
    id: int
    hostname: str
    os_version: str | None
    last_seen: datetime | None
    status: str
    latest_metrics: dict[str, Any] | None
    inventory: dict[str, Any] | None = None
    health_status: str | None = None
    health_score: int | None = None
    last_seen_status: str | None = None


class PaginatedMachines(BaseModel):
    items: list[MachineSummary]
    total: int
    page: int
    per_page: int
    pages: int


class MachineAnalysisResponse(BaseModel):
    machine_id: int
    hostname: str
    provider: str
    model: str | None = None
    generated_at: datetime
    summary: str
    severity: str
    confidence: int
    signals: list[str]
    recommendations: list[str]
    ai_enabled: bool
