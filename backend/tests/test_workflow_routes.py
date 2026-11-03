import uuid

from app.core.security import create_access_token, hash_password
from app.models import User
from conftest import auth, create_task_for_worker


def png(tag: str) -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + tag.encode()


def make_reviewer(setup) -> str:
    with setup["session_factory"]() as db:
        reviewer = User(
            email=f"reviewer-{uuid.uuid4().hex[:6]}@example.com",
            password_hash=hash_password("Reviewer-Test-Password-123"),
            full_name="Test Reviewer",
            role="manager",
            is_active=True,
        )
        db.add(reviewer)
        db.commit()
        return create_access_token(str(reviewer.id))


def upload(setup, task_id, tag="one", requirement_id=None):
    data = {"requirement_id": requirement_id} if requirement_id else None
    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": (f"{tag}.png", png(tag), "image/png")},
        data=data,
    )
    assert response.status_code == 201, response.text
    return response.json()


def order_id_of(setup, task_id) -> str:
    response = setup["client"].get(
        f"/tasks/{task_id}/evidence", headers=auth(setup["manager_token"])
    )
    assert response.status_code == 200
    with setup["session_factory"]() as db:
        from app.models import Task

        return str(db.get(Task, uuid.UUID(task_id)).work_order_id)


def open_order(setup, order_id):
    response = setup["client"].patch(
        f"/work-orders/{order_id}",
        json={"status": "open"},
        headers=auth(setup["manager_token"]),
    )
    assert response.status_code == 200, response.text


def test_task_evidence_list_and_access(setup):
    task_id = create_task_for_worker(setup)
    first = upload(setup, task_id, "a")
    second = upload(setup, task_id, "b")
    client = setup["client"]

    listed = client.get(
        f"/tasks/{task_id}/evidence", headers=auth(setup["worker_token"])
    )
    assert listed.status_code == 200
    assert {item["id"] for item in listed.json()} == {
        first["id"],
        second["id"],
    }
    assert "storage_key" not in listed.json()[0]

    other = create_access_token(str(setup["other_worker_id"]))
    assert (
        client.get(f"/tasks/{task_id}/evidence", headers=auth(other)).status_code
        == 404
    )
    assert client.get(f"/tasks/{task_id}/evidence").status_code == 401


def test_first_upload_starts_task_and_work_order(setup):
    task_id = create_task_for_worker(setup)
    order_id = order_id_of(setup, task_id)
    open_order(setup, order_id)
    upload(setup, task_id)
    client = setup["client"]

    task = client.get(
        f"/work-orders/{order_id}/tasks", headers=auth(setup["manager_token"])
    ).json()[0]
    order = client.get(
        f"/work-orders/{order_id}", headers=auth(setup["manager_token"])
    ).json()
    assert task["status"] == "in_progress"
    assert order["status"] == "in_progress"


def test_submit_needs_evidence_and_required_items(setup):
    task_id = create_task_for_worker(setup)
    client = setup["client"]
    worker = auth(setup["worker_token"])

    empty = client.post(f"/tasks/{task_id}/submit", headers=worker)
    assert empty.status_code == 422

    requirement = client.post(
        f"/tasks/{task_id}/requirements",
        json={
            "title": "Valve label",
            "instructions": "Photo of the label",
            "response_type": "photo",
            "minimum_evidence_count": 2,
        },
        headers=auth(setup["manager_token"]),
    )
    assert requirement.status_code == 201, requirement.text
    requirement_id = requirement.json()["id"]

    upload(setup, task_id, "a", requirement_id)
    short = client.post(f"/tasks/{task_id}/submit", headers=worker)
    assert short.status_code == 422
    assert "Valve label (1 more)" in short.json()["detail"]

    upload(setup, task_id, "b", requirement_id)
    done = client.post(f"/tasks/{task_id}/submit", headers=worker)
    assert done.status_code == 200
    assert done.json()["status"] == "submitted"

    again = client.post(f"/tasks/{task_id}/submit", headers=worker)
    assert again.status_code == 409


def test_worker_cannot_review(setup):
    task_id = create_task_for_worker(setup)
    upload(setup, task_id)
    client = setup["client"]
    client.post(f"/tasks/{task_id}/submit", headers=auth(setup["worker_token"]))
    body = {"decision": "approved", "reason": "Looks good"}
    denied = client.post(
        f"/tasks/{task_id}/reviews",
        json=body,
        headers=auth(setup["worker_token"]),
    )
    assert denied.status_code == 403


def test_review_flow_updates_task_work_order_and_audit(setup):
    task_id = create_task_for_worker(setup)
    order_id = order_id_of(setup, task_id)
    open_order(setup, order_id)
    upload(setup, task_id)
    client = setup["client"]
    reviewer = auth(make_reviewer(setup))
    manager = auth(setup["manager_token"])

    not_yet = client.post(
        f"/tasks/{task_id}/reviews",
        json={"decision": "approved", "reason": "Fine"},
        headers=reviewer,
    )
    assert not_yet.status_code == 409

    client.post(f"/tasks/{task_id}/submit", headers=auth(setup["worker_token"]))
    assert (
        client.get(f"/work-orders/{order_id}", headers=manager).json()["status"]
        == "submitted"
    )

    more = client.post(
        f"/tasks/{task_id}/reviews",
        json={"decision": "needs_more_evidence", "reason": "Label is blurry"},
        headers=reviewer,
    )
    assert more.status_code == 201, more.text
    task = client.get(
        f"/work-orders/{order_id}/tasks", headers=manager
    ).json()[0]
    assert task["status"] == "in_progress"

    upload(setup, task_id, "again")
    client.post(f"/tasks/{task_id}/submit", headers=auth(setup["worker_token"]))
    approved = client.post(
        f"/tasks/{task_id}/reviews",
        json={"decision": "approved", "reason": "Clear now"},
        headers=reviewer,
    )
    assert approved.status_code == 201
    assert (
        client.get(f"/work-orders/{order_id}", headers=manager).json()["status"]
        == "approved"
    )

    history = client.get(f"/tasks/{task_id}/reviews", headers=manager).json()
    assert [item["decision"] for item in history] == [
        "approved",
        "needs_more_evidence",
    ]

    audit = client.get(f"/work-orders/{order_id}/audit", headers=manager)
    assert audit.status_code == 200
    actions = {event["action"] for event in audit.json()}
    assert {
        "work_order.created",
        "task.created",
        "evidence.uploaded",
        "task.started",
        "task.submitted",
        "review.saved",
        "work_order.status_changed",
    } <= actions


def test_review_validation_and_audit_access(setup):
    task_id = create_task_for_worker(setup)
    order_id = order_id_of(setup, task_id)
    client = setup["client"]
    reviewer = auth(make_reviewer(setup))

    bad = client.post(
        f"/tasks/{task_id}/reviews",
        json={"decision": "maybe", "reason": "x"},
        headers=reviewer,
    )
    assert bad.status_code == 422

    assert (
        client.get(
            f"/work-orders/{order_id}/audit",
            headers=auth(setup["worker_token"]),
        ).status_code
        == 403
    )
    assert client.get(f"/work-orders/{order_id}/audit").status_code == 401
    assert (
        client.get(
            f"/work-orders/{uuid.uuid4()}/audit", headers=reviewer
        ).status_code
        == 404
    )
