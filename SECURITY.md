# SECURITY

## Security principles

- HTTPS-only transport in production.
- API key authentication on all current API endpoints.
- No collection of passwords, screenshots, or personal files.
- Store secrets in environment variables.

## Current controls

- `x-api-key` header verification in backend.
- Pydantic request validation on telemetry payloads.
- Minimal telemetry collection design.

## Recommended next controls

- Migrate from single env key to `api_keys` table with key rotation.
- Hash API keys at rest.
- Add request rate limiting and audit logging.
- Add per-endpoint role controls when users/auth are introduced.
