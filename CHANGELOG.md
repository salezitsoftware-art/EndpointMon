# CHANGELOG

## 0.1.0 - 2026-05-29

- Initialized EndpointWatch project structure.
- Added FastAPI backend with telemetry ingestion endpoint.
- Switched dev database to SQLite and validated ingestion.
- Added machine registration and telemetry persistence.
- Added alert model and threshold-based alert generation.
- Implemented required read APIs:
  - `GET /api/machines`
  - `GET /api/machines/{id}`
  - `GET /api/machines/{id}/history`
  - `GET /api/alerts`
- Added PowerShell agent skeleton with retry and logging.
- Added Task Scheduler install script for the agent.
- Added React + TypeScript + Vite + Tailwind dashboard scaffold.
