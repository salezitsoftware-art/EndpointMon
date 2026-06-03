# AGENT_SPEC

EndpointWatch agent is a lightweight PowerShell script that runs on Windows endpoints, collects non-sensitive telemetry, and sends JSON payloads to backend API.

## Collected telemetry (v1)

- `cpu` (%)
- `ram` (% used)
- `disk` (% used on C:)
- `latency_ms` (single ping response)
- `wifi_signal` (%)
- `rdp_active` (bool)
- `monitor_count`
- `primary_resolution`
- `gpu` (best effort)
- `gpu_memory_usage_mb` (reserved placeholder, null if unavailable)

## Security

- Uses API key in `x-api-key` header.
- Sends no passwords, no screenshots, no personal files.

## Execution

- Main script: `agent/scripts/collect-and-send.ps1`
- Scheduler installer: `agent/scripts/install-task.ps1`
- Recommended schedule: every 5 to 15 minutes.

## Payload shape

```json
{
  "hostname": "LAPTOP-001",
  "timestamp": "2026-05-29T21:20:00.0000000+00:00",
  "metrics": {
    "cpu": 24.5,
    "ram": 61.2,
    "disk": 72.1,
    "latency_ms": 41,
    "wifi_signal": 83,
    "rdp_active": false,
    "monitor_count": 2,
    "primary_resolution": "1920x1080",
    "gpu": 33.4,
    "gpu_memory_usage_mb": null
  }
}
```
