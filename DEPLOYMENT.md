# DEPLOYMENT

## Development

### Backend
```powershell
cd backend
.\.venv\Scripts\Activate
pip install -r requirements.txt
python -m app.db.init_db
uvicorn app.main:app --reload --port 8000
```

### Frontend
```powershell
cd frontend
npm install
npm run dev
```

### Agent (one-time test)
```powershell
cd agent\scripts
powershell -NoProfile -ExecutionPolicy Bypass -File .\collect-and-send.ps1 -ApiUrl "http://127.0.0.1:8000/api/telemetry" -ApiKey "<API_KEY>"
```

## Production Deployment

The simplest and most secure way to deploy EndpointWatch in production is using Docker Compose. This packages the frontend, backend, and PostgreSQL database into containerized services.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Configuration

Before launching, update the production environment variables in [docker-compose.yml](file:///c:/Users/mmcy/Desktop/EndpointWatch/docker-compose.yml):
1. **Database Credentials**: Change the `POSTGRES_PASSWORD` for the `db` service and update the password in the backend's `DATABASE_URL`.
2. **Security Keys**:
   - `API_KEY`: Set a secure random string. Workstations sending telemetry will need this key in their headers as `x-api-key`.
   - `SECRET_KEY`: Set a secure random string for backend session and token signing.
3. **AI/LLM Config (Optional)**: If you use the AI analysis feature, configure your `AI_PROVIDER`, `AI_MODEL`, and API key (e.g. `OPENAI_API_KEY` or `GEMINI_API_KEY`).

### Launching the Stack

To build and start the entire stack in the background:
```bash
docker compose up -d --build
```

This will:
1. Boot up the PostgreSQL database and wait for it to become healthy.
2. Start the backend container, automatically run database schema migrations using Alembic, and spin up the FastAPI server on port 8000.
3. Start the Nginx server on port 80, serving the production-built React assets and reverse proxying any requests to `/api` to the backend container.

### Monitoring & Operations

- **Logs**: View service logs using `docker compose logs -f [service_name]`.
- **Shutdown**: Stop the container stack using `docker compose down`.
- **Database Backups**: Back up the `postgres_data` volume regularly.

### Agent Configuration (Production)

Schedule the PowerShell agent on production workstations to collect telemetry periodically (e.g., every 5 minutes):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\collect-and-send.ps1 -ApiUrl "https://<YOUR_DEPLOYED_DOMAIN>/api/telemetry" -ApiKey "<PRODUCTION_API_KEY>"
```
> [!IMPORTANT]
> Always secure the domain with HTTPS in production so that telemetry payload and the API key are encrypted in transit. Nginx inside the docker container runs on HTTP port 80 by default; configure an SSL-terminating reverse proxy (like Cloudflare, Traefik, or an external Nginx server) in front of port 80.

