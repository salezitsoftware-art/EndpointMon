from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from .routers import telemetry
from .routers import machines
from .routers import alerts
from .routers import api_keys
from .routers import ai_router
from .routers import ai_machine
from .routers import agent_docs


def create_app() -> FastAPI:
    app = FastAPI(title="EndpointWatch Backend")

    # CORS for local development. Set CORS_ORIGINS as comma-separated list to restrict.
    origins = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000",
    )
    origins_list = [o.strip() for o in origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(telemetry.router, prefix="/api")
    app.include_router(machines.router, prefix="/api")
    app.include_router(alerts.router, prefix="/api")
    app.include_router(api_keys.router, prefix="/api")
    app.include_router(ai_router.router, prefix="/api")
    app.include_router(ai_machine.router, prefix="/api")
    app.include_router(agent_docs.router, prefix="/api")
    return app


app = create_app()
