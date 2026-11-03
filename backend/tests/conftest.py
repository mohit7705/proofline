import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_db
from app.core.security import create_access_token, hash_password
from app.core.rate_limit import limiter
from app.main import app
from app.models import Base, User


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Every test starts with empty rate-limit counters."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def setup(monkeypatch, tmp_path):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-only-secret-key-long-enough-32")
    monkeypatch.setenv("EVIDENCE_STORAGE_DIR", str(tmp_path))

    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False
    )

    with TestingSession() as db:
        manager = User(
            email="evidence-manager@example.com",
            password_hash=hash_password("Manager-Test-Password-123"),
            full_name="Evidence Manager",
            role="manager",
            is_active=True,
        )
        worker = User(
            email="evidence-worker@example.com",
            password_hash=hash_password("Worker-Test-Password-123"),
            full_name="Evidence Worker",
            role="worker",
            is_active=True,
        )
        other_worker = User(
            email="evidence-other@example.com",
            password_hash=hash_password("Other-Test-Password-123"),
            full_name="Other Worker",
            role="worker",
            is_active=True,
        )
        db.add_all([manager, worker, other_worker])
        db.commit()

        manager_id = manager.id
        worker_id = worker.id
        other_worker_id = other_worker.id

    def override_get_db():
        with TestingSession() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        yield {
            "client": client,
            "manager_token": create_access_token(str(manager_id)),
            "worker_token": create_access_token(str(worker_id)),
            "manager_id": manager_id,
            "worker_id": worker_id,
            "other_worker_id": other_worker_id,
            "session_factory": TestingSession,
            "storage_dir": tmp_path,
        }

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def create_task_for_worker(setup, assigned_to=None):
    client = setup["client"]
    order = client.post(
        "/work-orders",
        json={
            "title": "Inspect equipment",
            "description": "Verify equipment condition",
            "assigned_to": str(setup["worker_id"]),
        },
        headers=auth(setup["manager_token"]),
    )
    assert order.status_code == 201, order.text

    task = client.post(
        f"/work-orders/{order.json()['id']}/tasks",
        json={
            "title": "Capture equipment photo",
            "instructions": "Upload a clear image",
            "assigned_to": str(assigned_to or setup["worker_id"]),
        },
        headers=auth(setup["manager_token"]),
    )
    assert task.status_code == 201, task.text
    return task.json()["id"]
