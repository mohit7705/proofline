import os

# Ensure importing the application does not depend on a developer's shell setup.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://test:test@localhost:5432/test",
)

from fastapi.testclient import TestClient

from app import main


client = TestClient(main.app)


def test_root_returns_api_welcome():
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "message": "Welcome to the Proofline AI API",
        "docs": "/docs",
    }


def test_health_returns_healthy_when_database_is_connected(monkeypatch):
    monkeypatch.setattr(main, "check_database_connection", lambda: True)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "service": "proofline-api",
        "database": "connected",
    }


def test_health_returns_503_when_database_is_unavailable(monkeypatch):
    def fail_database_check():
        raise RuntimeError("Simulated database outage")

    monkeypatch.setattr(main, "check_database_connection", fail_database_check)

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "unhealthy",
        "service": "proofline-api",
        "database": "disconnected",
    }
