EndpointWatch
=============

EndpointWatch is an internal endpoint telemetry and monitoring platform to diagnose workstation and RDP performance issues.

This repository contains three primary areas:
- `backend/` — FastAPI backend and services
- `frontend/` — React + TypeScript dashboard (Vite)
- `agent/` — PowerShell agent specification and scripts

See ROADMAP.md and ARCHITECTURE.md for details.

AI analysis
-----------

EndpointWatch can analyze a machine on demand from the machine detail view. The backend will use an OpenAI-compatible provider when configured, and falls back to a local rules-based summary when no AI key is available.

Optional backend env vars:
- `AI_PROVIDER=auto`
- `AI_MODEL=gpt-4o-mini`
- `OPENAI_API_KEY=...`
- `OPENAI_BASE_URL=https://api.openai.com/v1`

The analysis endpoint is `POST /api/machines/{machine_id}/analysis`.
