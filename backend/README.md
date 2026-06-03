# Backend

FastAPI backend for telemetry ingestion and APIs.

Run in development:

```
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run migrations:

```
alembic upgrade head
```

Run tests:

```
pytest -q
```

Environment:

```
DATABASE_URL=sqlite+aiosqlite:///./endpointwatch.db
API_KEY=replace_me
SECRET_KEY=replace_me
```

Auth headers:

- `x-api-key`: for telemetry and read APIs (supports env key and DB-backed keys).
- `x-admin-key`: for API key management endpoints.

API key management endpoints:

- `POST /api/keys/generate` (admin): generate a new DB-backed API key.
- `GET /api/keys` (admin): list generated API keys.
- `POST /api/keys/{key_id}/revoke` (admin): revoke an API key.
