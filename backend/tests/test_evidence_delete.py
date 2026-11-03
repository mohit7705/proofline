import uuid

from app.models import Task

from test_self_work_roles_and_challenge import auth, make_task, new_user, upload_phase


def test_worker_removes_own_file_then_uploads_again(setup):
    client = setup["client"]
    task_id, (req,) = make_task(setup, [{"minimum_evidence_count": 1}])
    worker = auth(setup["worker_token"])
    first = upload_phase(setup, task_id, "wrong", None, req)
    assert first.status_code == 201
    evidence_id = first.json()["id"]

    assert client.delete(f"/evidence/{evidence_id}", headers=worker).status_code == 204
    assert client.get(f"/evidence/{evidence_id}", headers=worker).status_code == 404
    assert upload_phase(setup, task_id, "right", None, req).status_code == 201


def test_changing_a_file_withdraws_a_submission_but_not_after_approval(setup):
    client = setup["client"]
    task_id, (req,) = make_task(setup, [{"minimum_evidence_count": 1}])
    worker = auth(setup["worker_token"])
    evidence_id = upload_phase(setup, task_id, "p", None, req).json()["id"]

    other = auth(new_user(setup, "worker", "Other")[1])
    assert client.delete(f"/evidence/{evidence_id}", headers=other).status_code in (403, 404)

    assert client.post(f"/tasks/{task_id}/submit", headers=worker).status_code == 200
    assert client.delete(f"/evidence/{evidence_id}", headers=worker).status_code == 204
    with setup["session_factory"]() as db:
        assert db.get(Task, uuid.UUID(task_id)).status == "in_progress"

    again = upload_phase(setup, task_id, "right", None, req).json()["id"]
    with setup["session_factory"]() as db:
        db.get(Task, uuid.UUID(task_id)).status = "approved"
        db.commit()
    assert client.delete(f"/evidence/{again}", headers=worker).status_code == 409
    assert client.delete(f"/evidence/{uuid.uuid4()}", headers=worker).status_code == 404
