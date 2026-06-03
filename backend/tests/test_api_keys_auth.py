import asyncio

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import get_db
from app.main import create_app
from app.models import Base


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_file = tmp_path / "test_endpointwatch.db"
    database_url = f"sqlite+aiosqlite:///{db_file}"

    monkeypatch.setenv("API_KEY", "legacy_test_key")
    monkeypatch.setenv("SECRET_KEY", "admin_test_key")

    engine = create_async_engine(database_url, future=True)
    TestingSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def init_models():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def drop_models():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    async def override_get_db():
        async with TestingSessionLocal() as session:
            yield session

    asyncio.run(init_models())

    app = create_app()
    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    asyncio.run(drop_models())
    asyncio.run(engine.dispose())


def _telemetry_payload(hostname: str = "pytest-host") -> dict:
    return {
        "hostname": hostname,
        "timestamp": "2026-05-29T00:00:00Z",
        "metrics": {"cpu": 20, "ram": 30, "gpu": 10, "latency_ms": 15},
    }


def test_legacy_env_api_key_still_works(client: TestClient):
    response = client.post(
        "/api/telemetry",
        headers={"x-api-key": "legacy_test_key"},
        json=_telemetry_payload("legacy-key-host"),
    )
    assert response.status_code == 201


def test_db_api_key_lifecycle(client: TestClient):
    generate_response = client.post(
        "/api/keys/generate",
        headers={"x-admin-key": "admin_test_key"},
        json={"name": "pytest-key"},
    )
    assert generate_response.status_code == 201

    generated = generate_response.json()
    generated_key = generated["api_key"]
    key_id = generated["id"]

    accept_response = client.post(
        "/api/telemetry",
        headers={"x-api-key": generated_key},
        json=_telemetry_payload("db-key-host"),
    )
    assert accept_response.status_code == 201

    revoke_response = client.post(
        f"/api/keys/{key_id}/revoke",
        headers={"x-admin-key": "admin_test_key"},
    )
    assert revoke_response.status_code == 200
    assert revoke_response.json()["is_active"] is False

    denied_response = client.post(
        "/api/telemetry",
        headers={"x-api-key": generated_key},
        json=_telemetry_payload("db-key-host"),
    )
    assert denied_response.status_code == 401
