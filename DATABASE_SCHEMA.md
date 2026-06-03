# DATABASE_SCHEMA

Current database engine for development: SQLite.

## tables

### machines
- `id` (PK)
- `hostname` (indexed)
- `os_version` (nullable)
- `last_seen`

### telemetry
- `id` (PK)
- `machine_id` (FK -> machines.id, indexed)
- `timestamp` (nullable)
- `metrics` (JSON)
- `created_at`

### alerts
- `id` (PK)
- `machine_id` (FK -> machines.id, indexed)
- `alert_type` (indexed)
- `severity`
- `message`
- `metric_name`
- `metric_value`
- `threshold`
- `is_resolved`
- `created_at`
- `resolved_at`

## planned tables

### api_keys
- For rotateable machine/API keys.

### users
- Reserved for future enterprise authentication.
