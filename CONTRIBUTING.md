# CONTRIBUTING

## Workflow

1. Create a feature branch.
2. Keep changes small and modular.
3. Run backend and frontend checks before PR.
4. Update docs for behavior/schema/API changes.

## Code standards

- Python: type hints, readable service/router separation.
- TypeScript: strict types, avoid `any`.
- PowerShell: Verb-Noun functions and defensive error handling.

## Validation checklist

- `POST /api/telemetry` succeeds with valid `x-api-key`.
- `/api/machines`, `/api/machines/{id}`, `/api/machines/{id}/history`, `/api/alerts` return valid data.
- `npm run build` succeeds for frontend.
