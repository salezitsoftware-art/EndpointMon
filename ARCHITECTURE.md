# Architecture

System overview:

Windows Endpoint -> PowerShell Agent -> HTTPS -> FastAPI Backend -> PostgreSQL -> React Dashboard

Design principles: modular services, async IO for ingestion, SQLAlchemy ORM, clear separation of routers/services/schemas.
