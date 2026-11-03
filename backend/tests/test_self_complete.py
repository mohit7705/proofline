import time
import uuid

from conftest import auth
from test_self_work_roles_and_challenge import (
    item,
    make_task,
    save,
    upload_phase,
    worker_creates_work,
)


def own_submitted_task(setup):
    client = setup["client"]
    _, task, req = worker_creates_work(setup)
    worker = auth(setup["worker_token"])
    assert upload_phase(setup, task["id"], "proof", None, req["id"]).status_code == 201
    assert client.post(f"/tasks/{task['id']}/submit", headers=worker).status_code == 200
    return task["id"], req["id"], worker


def test_cannot_complete_without_a_strong_ai_score(setup):
    client = setup["client"]
    task_id, req, worker = own_submitted_task(setup)
    assert client.post(f"/tasks/{task_id}/complete", headers=worker).status_code == 409
    save(setup, task_id, [item(req, 50, "Before and After do not match")])
    assert client.post(f"/tasks/{task_id}/complete", headers=worker).status_code == 409


def test_strong_score_lets_the_worker_close_their_own_work(setup):
    client = setup["client"]
    task_id, req, worker = own_submitted_task(setup)
    save(setup, task_id, [item(req, 95)])
    done = client.post(f"/tasks/{task_id}/complete", headers=worker)
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "approved"
    assert client.post(f"/tasks/{task_id}/complete", headers=worker).status_code == 409


def test_new_files_after_the_score_make_it_stale(setup):
    client = setup["client"]
    task_id, req, worker = own_submitted_task(setup)
    save(setup, task_id, [item(req, 95)])
    time.sleep(1.1)
    assert upload_phase(setup, task_id, "later", None, req).status_code == 201
    assert client.post(f"/tasks/{task_id}/complete", headers=worker).status_code == 409


def test_work_given_by_a_manager_still_needs_a_manager(setup):
    client = setup["client"]
    task_id, (req,) = make_task(setup, [{"minimum_evidence_count": 1}])
    worker = auth(setup["worker_token"])
    assert upload_phase(setup, task_id, "p", None, req).status_code == 201
    assert client.post(f"/tasks/{task_id}/submit", headers=worker).status_code == 200
    save(setup, task_id, [item(req, 95)])
    assert client.post(f"/tasks/{task_id}/complete", headers=worker).status_code == 403
    assert client.post(f"/tasks/{uuid.uuid4()}/complete", headers=worker).status_code == 404
