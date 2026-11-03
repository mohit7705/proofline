import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models import Base, User, WorkOrder


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-only-secret-key-long-enough-32")

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
            email="manager-api@example.com",
            password_hash=hash_password("Manager-Test-Password-123"),
            full_name="API Manager",
            role="manager",
            is_active=True,
        )
        worker = User(
            email="worker-api@example.com",
            password_hash=hash_password("Worker-Test-Password-123"),
            full_name="API Worker",
            role="worker",
            is_active=True,
        )
        db.add_all([manager, worker])
        db.commit()
        db.refresh(manager)
        db.refresh(worker)

        manager_id = manager.id
        worker_id = worker.id
        manager_token = create_access_token(str(manager_id))
        worker_token = create_access_token(str(worker_id))

    def override_get_db():
        with TestingSession() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        yield {
            "client": client,
            "manager_token": manager_token,
            "worker_token": worker_token,
            "manager_id": manager_id,
            "worker_id": worker_id,
            "session_factory": TestingSession,
        }

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def create_order(client, token, **overrides):
    payload = {
        "title": "Inspect equipment",
        "description": "Verify equipment condition",
    }
    payload.update(overrides)
    return client.post(
        "/work-orders", json=payload, headers=auth(token)
    )


def test_manager_can_create_work_order(setup):
    r = create_order(setup["client"], setup["manager_token"])
    assert r.status_code == 201
    assert r.json()["status"] == "draft"
    assert r.json()["created_by"] == str(setup["manager_id"])


def test_worker_can_only_create_work_for_themselves(setup):
    someone_else = str(uuid.uuid4())
    r = create_order(setup["client"], setup["worker_token"], assigned_to=someone_else)
    assert r.status_code == 403


def test_manager_can_update_and_delete_draft(setup):
    client = setup["client"]
    token = setup["manager_token"]

    created = create_order(client, token)
    order_id = created.json()["id"]

    updated = client.patch(
        f"/work-orders/{order_id}",
        json={"title": "Inspect updated equipment", "status": "open"},
        headers=auth(token),
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Inspect updated equipment"
    assert updated.json()["status"] == "open"

    deleted = client.delete(
        f"/work-orders/{order_id}", headers=auth(token)
    )
    assert deleted.status_code == 409  # Only drafts can be deleted


def test_manager_can_delete_draft(setup):
    client = setup["client"]
    created = create_order(client, setup["manager_token"])
    deleted = client.delete(
        f"/work-orders/{created.json()['id']}",
        headers=auth(setup["manager_token"]),
    )
    assert deleted.status_code == 204


def test_worker_sees_only_assigned_orders(setup):
    client = setup["client"]
    manager_token = setup["manager_token"]
    worker_token = setup["worker_token"]

    created = create_order(
        client, manager_token, assigned_to=str(setup["worker_id"])
    )
    assert created.status_code == 201

    visible = client.get(
        "/work-orders", headers=auth(worker_token)
    )
    assert visible.status_code == 200
    assert len(visible.json()) == 1

    unassigned = create_order(client, manager_token)
    assert unassigned.status_code == 201

    visible_again = client.get(
        "/work-orders", headers=auth(worker_token)
    )
    assert len(visible_again.json()) == 1


def test_worker_cannot_access_unassigned_order(setup):
    client = setup["client"]
    created = create_order(client, setup["manager_token"])
    order_id = created.json()["id"]

    response = client.get(
        f"/work-orders/{order_id}",
        headers=auth(setup["worker_token"]),
    )
    assert response.status_code == 404


def test_invalid_assignee_rejected(setup):
    response = create_order(
        setup["client"],
        setup["manager_token"],
        assigned_to=str(uuid.uuid4()),
    )
    assert response.status_code == 422


def test_unauthenticated_access_rejected(setup):
    response = setup["client"].get("/work-orders")
    assert response.status_code == 401


def test_invalid_status_rejected(setup):
    created = create_order(setup["client"], setup["manager_token"])
    response = setup["client"].patch(
        f"/work-orders/{created.json()['id']}",
        json={"status": "unknown"},
        headers=auth(setup["manager_token"]),
    )
    assert response.status_code == 422


def test_manager_can_create_location(setup):
    response = setup["client"].post(
        "/locations",
        json={
            "site": "Bhopal Plant",
            "building": "Block A",
            "floor": "2",
            "room": "204",
            "equipment": "HVAC-01",
        },
        headers=auth(setup["manager_token"]),
    )
    assert response.status_code == 201
    assert response.json()["site"] == "Bhopal Plant"
    assert response.json()["building"] == "Block A"
    assert response.json()["equipment"] == "HVAC-01"


def test_worker_can_create_location_for_their_own_work(setup):
    response = setup["client"].post(
        "/locations",
        json={"site": "My Site"},
        headers=auth(setup["worker_token"]),
    )
    assert response.status_code == 201


def test_manager_can_assign_task_to_worker_and_location(setup):
    client = setup["client"]
    manager_token = setup["manager_token"]

    location_response = client.post(
        "/locations",
        json={
            "site": "Bhopal Plant",
            "building": "Block B",
            "floor": "1",
            "room": "101",
            "equipment": "Pump-02",
        },
        headers=auth(manager_token),
    )
    assert location_response.status_code == 201
    location_id = location_response.json()["id"]

    order_response = create_order(client, manager_token)
    assert order_response.status_code == 201
    order_id = order_response.json()["id"]

    task_response = client.post(
        f"/work-orders/{order_id}/tasks",
        json={
            "title": "Inspect pump",
            "instructions": "Check condition and capture evidence",
            "assigned_to": str(setup["worker_id"]),
            "location_id": location_id,
            "position": 0,
        },
        headers=auth(manager_token),
    )
    assert task_response.status_code == 201
    task = task_response.json()
    assert task["assigned_to"] == str(setup["worker_id"])
    assert task["location_id"] == location_id
    assert task["work_order_id"] == order_id


def test_worker_cannot_create_task(setup):
    client = setup["client"]
    order_response = create_order(client, setup["manager_token"])
    response = client.post(
        f"/work-orders/{order_response.json()['id']}/tasks",
        json={
            "title": "Inspect pump",
            "instructions": "Check condition",
        },
        headers=auth(setup["worker_token"]),
    )
    # Not the worker's own work, so the order is not even visible to them.
    assert response.status_code in (403, 404)


def test_task_rejects_invalid_worker_assignment(setup):
    client = setup["client"]
    order_response = create_order(client, setup["manager_token"])
    response = client.post(
        f"/work-orders/{order_response.json()['id']}/tasks",
        json={
            "title": "Inspect pump",
            "instructions": "Check condition",
            "assigned_to": str(uuid.uuid4()),
        },
        headers=auth(setup["manager_token"]),
    )
    assert response.status_code == 422


def test_task_list_requires_work_order_access(setup):
    client = setup["client"]
    order_response = create_order(client, setup["manager_token"])
    response = client.get(
        f"/work-orders/{order_response.json()['id']}/tasks",
        headers=auth(setup["worker_token"]),
    )
    assert response.status_code == 404


def test_manager_can_create_and_list_checklist_requirements(setup):
    client = setup["client"]
    token = setup["manager_token"]

    order = create_order(client, token).json()
    task = client.post(
        f"/work-orders/{order['id']}/tasks",
        json={
            "title": "Inspect equipment",
            "instructions": "Perform visual inspection",
        },
        headers=auth(token),
    ).json()

    response = client.post(
        f"/tasks/{task['id']}/requirements",
        json={
            "title": "Check equipment condition",
            "instructions": "Confirm equipment is undamaged",
            "response_type": "boolean",
            "is_required": True,
            "position": 0,
        },
        headers=auth(token),
    )
    assert response.status_code == 201
    assert response.json()["response_type"] == "boolean"

    listed = client.get(
        f"/tasks/{task['id']}/requirements",
        headers=auth(token),
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_worker_cannot_create_checklist_requirement(setup):
    client = setup["client"]
    order = create_order(client, setup["manager_token"]).json()
    task = client.post(
        f"/work-orders/{order['id']}/tasks",
        json={
            "title": "Inspect equipment",
            "instructions": "Perform inspection",
        },
        headers=auth(setup["manager_token"]),
    ).json()

    response = client.post(
        f"/tasks/{task['id']}/requirements",
        json={
            "title": "Check equipment condition",
            "instructions": "Confirm condition",
        },
        headers=auth(setup["worker_token"]),
    )
    assert response.status_code in (403, 404)


def test_invalid_checklist_response_type_rejected(setup):
    client = setup["client"]
    order = create_order(client, setup["manager_token"]).json()
    task = client.post(
        f"/work-orders/{order['id']}/tasks",
        json={
            "title": "Inspect equipment",
            "instructions": "Perform inspection",
        },
        headers=auth(setup["manager_token"]),
    ).json()

    response = client.post(
        f"/tasks/{task['id']}/requirements",
        json={
            "title": "Check equipment condition",
            "instructions": "Confirm condition",
            "response_type": "unknown",
        },
        headers=auth(setup["manager_token"]),
    )
    assert response.status_code == 422
