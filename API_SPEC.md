# API_SPEC

Base URL: `/api`

Authentication: `x-api-key` header is required for all endpoints.

## POST /telemetry

Ingest endpoint telemetry.

Request body:

```json
{
  "hostname": "LAPTOP-001",
  "timestamp": "2026-05-29T22:10:00",
  "metrics": {
    "cpu": 92,
    "ram": 88,
    "gpu": 95,
    "latency_ms": 185,
    "wifi_signal": 70
  }
}
```

Response: `201 Created` with telemetry id and payload echo.

## GET /machines

List machines with computed status (`online`/`offline`).

## GET /machines/{id}

Get machine detail and latest metrics.

## GET /machines/{id}/history

Get telemetry history for a machine.

Query params:
- `limit` (default `100`, max `1000`)

## GET /alerts

List generated alerts.

Query params:
- `active_only` (default `true`)
- `limit` (default `100`, max `1000`)
