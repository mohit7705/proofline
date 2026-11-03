import pytest
import uuid
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


from app.api.auth import get_current_user
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
    testing_session = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False
    )

    def override_get_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    engine.dispose()


def register_worker(client, email="role-worker@example.com"):
    return client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "Secure-Test-Password-123",
            "full_name": "Role Test Worker",
        },
    )


def test_manager_can_assign_role(client):
    created = register_worker(client)
    assert created.status_code == 201
    user_id = created.json()["id"]

    manager = SimpleNamespace(id=uuid.uuid4(), role="manager")
    client.app.dependency_overrides[get_current_user] = lambda: manager

    response = client.patch(
        f"/users/{user_id}/role",
        json={"role": "manager"},
    )

    assert response.status_code == 200
    assert response.json()["role"] == "manager"


def test_worker_cannot_assign_role(client):
    created = register_worker(client)
    assert created.status_code == 201
    user_id = created.json()["id"]

    worker = SimpleNamespace(id=uuid.uuid4(), role="worker")
    client.app.dependency_overrides[get_current_user] = lambda: worker

    response = client.patch(
        f"/users/{user_id}/role",
        json={"role": "manager"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions"


def test_invalid_role_is_rejected(client):
    created = register_worker(client)
    user_id = created.json()["id"]

    manager = SimpleNamespace(id=uuid.uuid4(), role="manager")
    client.app.dependency_overrides[get_current_user] = lambda: manager

    response = client.patch(
        f"/users/{user_id}/role",
        json={"role": "superadmin"},
    )

    assert response.status_code == 422


def test_manager_cannot_change_own_role(client):
    manager_id = uuid.uuid4()
    manager = SimpleNamespace(id=manager_id, role="manager")
    client.app.dependency_overrides[get_current_user] = lambda: manager

    response = client.patch(
        f"/users/{manager_id}/role",
        json={"role": "worker"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Managers cannot change their own role"


@pytest.mark.parametrize("role", ["manager"])
def test_staff_can_read_names_only_directory(client, role):
    created = register_worker(client)
    assert created.status_code == 201

    staff = SimpleNamespace(id=uuid.uuid4(), role=role)
    client.app.dependency_overrides[get_current_user] = lambda: staff
    response = client.get("/users/directory")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": created.json()["id"],
            "full_name": "Role Test Worker",
            "role": "worker",
        }
    ]
    assert "email" not in response.json()[0]


def test_worker_cannot_read_names_only_directory(client):
    worker = SimpleNamespace(id=uuid.uuid4(), role="worker")
    client.app.dependency_overrides[get_current_user] = lambda: worker

    response = client.get("/users/directory")

    assert response.status_code == 403
