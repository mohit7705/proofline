import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_db
from app.main import app
from app.models.user import User


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    User.__table__.create(engine)
    TestingSession = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False
    )

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    engine.dispose()


def register(client, email="worker@example.com", password="Secure-Test-Password-123"):
    return client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": "Test Worker",
        },
    )


def test_register_assigns_worker_role(client):
    response = register(client)
    assert response.status_code == 201
    assert response.json()["role"] == "worker"
    assert "password_hash" not in response.json()


def test_duplicate_email_rejected(client):
    register(client)
    response = register(client)
    assert response.status_code == 409


def test_login_and_current_user(client):
    register(client)
    response = client.post(
        "/auth/login",
        json={
            "email": "worker@example.com",
            "password": "Secure-Test-Password-123",
        },
    )
    assert response.status_code == 200
    token = response.json()["access_token"]

    profile = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert profile.status_code == 200
    assert profile.json()["email"] == "worker@example.com"


def test_invalid_password_rejected(client):
    register(client)
    response = client.post(
        "/auth/login",
        json={
            "email": "worker@example.com",
            "password": "Wrong-Password-123",
        },
    )
    assert response.status_code == 401


def test_current_user_requires_token(client):
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_google_login_creates_worker_and_returns_valid_token(
    client, monkeypatch
):
    from app.api.auth import verify_google_credential

    monkeypatch.setattr(
        "app.api.auth.verify_google_credential",
        lambda credential: {
            "sub": "google-user-1001",
            "email": "google.worker@example.com",
            "email_verified": True,
            "name": "Google Worker",
            "iss": "https://accounts.google.com",
        },
    )

    response = client.post(
        "/auth/google",
        json={"credential": "mock-google-credential"},
    )

    assert response.status_code == 200
    token = response.json()["access_token"]

    profile = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert profile.status_code == 200
    assert profile.json()["email"] == "google.worker@example.com"
    assert profile.json()["full_name"] == "Google Worker"
    assert profile.json()["role"] == "worker"


def test_google_login_reuses_existing_google_account(
    client, monkeypatch
):
    monkeypatch.setattr(
        "app.api.auth.verify_google_credential",
        lambda credential: {
            "sub": "google-user-1002",
            "email": "repeat.worker@example.com",
            "email_verified": True,
            "name": "Repeat Worker",
            "iss": "https://accounts.google.com",
        },
    )

    first = client.post(
        "/auth/google",
        json={"credential": "mock-google-credential"},
    )
    second = client.post(
        "/auth/google",
        json={"credential": "mock-google-credential"},
    )

    assert first.status_code == 200
    assert second.status_code == 200

    first_profile = client.get(
        "/auth/me",
        headers={
            "Authorization": f"Bearer {first.json()['access_token']}"
        },
    )
    second_profile = client.get(
        "/auth/me",
        headers={
            "Authorization": f"Bearer {second.json()['access_token']}"
        },
    )

    assert first_profile.status_code == 200
    assert second_profile.status_code == 200
    assert first_profile.json()["id"] == second_profile.json()["id"]


def test_google_login_rejects_existing_email_without_linking(
    client, monkeypatch
):
    register(client, email="existing.worker@example.com")

    monkeypatch.setattr(
        "app.api.auth.verify_google_credential",
        lambda credential: {
            "sub": "unlinked-google-user",
            "email": "existing.worker@example.com",
            "email_verified": True,
            "name": "Existing Worker",
            "iss": "https://accounts.google.com",
        },
    )

    response = client.post(
        "/auth/google",
        json={"credential": "mock-google-credential"},
    )

    assert response.status_code == 409


def test_google_login_rejects_invalid_credential(client, monkeypatch):
    from fastapi import HTTPException

    def reject_credential(credential):
        raise HTTPException(
            status_code=401,
            detail="Invalid Google credential",
        )

    monkeypatch.setattr(
        "app.api.auth.verify_google_credential",
        reject_credential,
    )

    response = client.post(
        "/auth/google",
        json={"credential": "invalid-credential"},
    )

    assert response.status_code == 401


def test_register_as_manager_when_chosen(client):
    response = client.post(
        "/auth/register",
        json={
            "email": "boss@example.com",
            "password": "Secure-Test-Password-123",
            "full_name": "Test Manager",
            "role": "manager",
        },
    )
    assert response.status_code == 201
    assert response.json()["role"] == "manager"


def test_register_rejects_inspector_role(client):
    response = client.post(
        "/auth/register",
        json={
            "email": "ian@example.com",
            "password": "Secure-Test-Password-123",
            "full_name": "Ian Inspector",
            "role": "inspector",
        },
    )
    assert response.status_code == 422
