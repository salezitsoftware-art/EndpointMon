# ALERT_RULES

Current automatic alert thresholds:

- `cpu > 85` -> `high_cpu`
- `ram > 85` -> `high_ram`
- `gpu > 90` -> `high_gpu`
- `latency_ms > 150` -> `high_latency_ms`

Alert severity (v1): `warning`

## Behavior

- Alerts are generated on telemetry ingest when thresholds are exceeded.
- Alerts are currently append-only and unresolved by default.

## Planned improvements

- De-duplication windows
- Auto-resolve logic
- Escalation levels and notification channels
