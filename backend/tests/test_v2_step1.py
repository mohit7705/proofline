"""v2 step 1: evidence phases, self-created work, challenge code, scores, roles."""

import re
import uuid

import pytest

from app.core.config import get_settings
from app.core.security import create_access_token, hash_password
from app.models import Task, User, WorkOrder
from app.services.scoring import band_for, save_score_set
from conftest import auth
from test_hardening_and_ai import mock_ai, upload_video  # noqa: F401 (fixture)
from test_verification_engine import add_task, add_video, make_task, verification
from test_workflow_routes import png

WORKER_PASSWORD = "Worker-Step1-Password-123"


def new_user(setup, role, name="Step One"):
    with setup["session_factory"]() as db:
        user = User(
            email=f"{role}-{uuid.uuid4().hex[:6]}@example.com",
            password_hash=hash_password(WORKER_PASSWORD),
            full_name=name,
            role=role,
            is_active=True,
        )
        db.add(user)
        db.commit()
        return user.id, create_access_token(str(user.id))


def upload_phase(setup, task_id, tag, phase=None, requirement_id=None, token=None, name=None):
    data = {}
    if phase is not None:
        data["phase"] = phase
    if requirement_id:
        data["requirement_id"] = requirement_id
    return setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(token or setup["worker_token"]),
        files={"file": (name or f"{tag}.png", png(tag), "image/png")},
        data=data or None,
    )


def worker_creates_work(setup, token=None):
    client = setup["client"]
    token = token or setup["worker_token"]
    order = client.post(
        "/work-orders",
        json={"title": "My own check", "description": "Set up by me"},
        headers=auth(token),
    )
    assert order.status_code == 201, order.text
    task = client.post(
        f"/work-orders/{order.json()['id']}/tasks",
        json={"title": "Check the gauge", "instructions": "Photograph it"},
        headers=auth(token),
    )
    assert task.status_code == 201, task.text
    item = client.post(
        f"/tasks/{task.json()['id']}/requirements",
        json={
            "title": "Gauge needle",
            "instructions": "Show it",
            "response_type": "photo",
            "minimum_evidence_count": 1,
        },
        headers=auth(token),
    )
    assert item.status_code == 201, item.text
    return order.json(), task.json(), item.json()


# ---------- evidence phase ----------

def test_evidence_phase_is_saved_and_validated(setup):
    task_id, _ = make_task(setup, [{"minimum_evidence_count": 1}])
    assert upload_phase(setup, task_id, "a").json()["phase"] == "other"
    assert upload_phase(setup, task_id, "b", "before").json()["phase"] == "before"
    assert upload_phase(setup, task_id, "c", "after").json()["phase"] == "after"
    assert upload_phase(setup, task_id, "d", "during").status_code == 422


def test_same_file_as_before_and_after_is_stored_twice_and_flagged(setup):
    task_id, (req,) = make_task(setup, [{"minimum_evidence_count": 2, "requires_before_after": True}])
    first = upload_phase(setup, task_id, "same", "before", req, name="shot.png")
    second = upload_phase(setup, task_id, "same", "after", req, name="shot.png")
    assert first.status_code == 201 and second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    body = verification(setup, task_id)
    assert any(s["label"] == "Duplicate file" for s in body["integrity_signals"])
    assert body["decision"] == "NEEDS_HUMAN_REVIEW"


def test_before_after_item_needs_both_files_to_submit(setup):
    client = setup["client"]
    task_id, (req,) = make_task(
        setup, [{"minimum_evidence_count": 2, "requires_before_after": True}]
    )
    assert verification(setup, task_id)["requirement_results"][0]["explanation"] == (
        "Add a Before file and an After file."
    )

    upload_phase(setup, task_id, "one", "before", req)
    upload_phase(setup, task_id, "two", "before", req)  # two "before", still no "after"
    refused = client.post(f"/tasks/{task_id}/submit", headers=auth(setup["worker_token"]))
    assert refused.status_code == 422
    assert "an After file" in refused.json()["detail"]
    body = verification(setup, task_id, method="post")
    assert body["requirement_results"][0]["decision"] == "NEEDS_MORE_EVIDENCE"
    assert body["requirement_results"][0]["explanation"] == "Add an After file."

    upload_phase(setup, task_id, "three", "after", req)
    accepted = client.post(f"/tasks/{task_id}/submit", headers=auth(setup["worker_token"]))
    assert accepted.status_code == 200, accepted.text


def test_item_without_the_flag_ignores_phase(setup):
    task_id, (req,) = make_task(setup, [{"minimum_evidence_count": 1}])
    upload_phase(setup, task_id, "solo", None, req)
    done = setup["client"].post(f"/tasks/{task_id}/submit", headers=auth(setup["worker_token"]))
    assert done.status_code == 200


# ---------- workers create their own work ----------

def test_worker_creates_own_work_order_task_and_checklist(setup):
    client = setup["client"]
    order, task, item = worker_creates_work(setup)
    assert order["is_self_created"] is True
    assert order["status"] == "open"
    assert order["assigned_to"] == str(setup["worker_id"])
    assert order["created_by_name"] == "Evidence Worker"
    assert task["assigned_to"] == str(setup["worker_id"])
    assert task["is_self_created"] is True
    assert item["requires_before_after"] is False

    mine = client.get("/work-orders", headers=auth(setup["worker_token"])).json()
    assert [o["id"] for o in mine] == [order["id"]]
    seen = client.get("/work-orders", headers=auth(setup["manager_token"])).json()
    assert seen[0]["is_self_created"] is True

    changed = client.patch(
        f"/tasks/{task['id']}", json={"title": "Check the gauge twice"},
        headers=auth(setup["worker_token"]),
    )
    assert changed.status_code == 200
    assert changed.json()["title"] == "Check the gauge twice"
    pair = client.patch(
        f"/requirements/{item['id']}", json={"requires_before_after": True},
        headers=auth(setup["worker_token"]),
    )
    assert pair.status_code == 200 and pair.json()["requires_before_after"] is True


def test_worker_cannot_assign_or_change_status_or_delete(setup):
    client = setup["client"]
    other = str(setup["other_worker_id"])
    order, task, _ = worker_creates_work(setup)
    worker = auth(setup["worker_token"])
    assert client.post(
        f"/work-orders/{order['id']}/tasks",
        json={"title": "For someone else", "instructions": "x", "assigned_to": other},
        headers=worker,
    ).status_code == 403
    assert client.patch(
        f"/tasks/{task['id']}", json={"status": "approved"}, headers=worker
    ).status_code == 403
    assert client.patch(
        f"/tasks/{task['id']}", json={"assigned_to": other}, headers=worker
    ).status_code == 403
    assert client.delete(f"/tasks/{task['id']}", headers=worker).status_code == 403
    assert client.patch(
        f"/work-orders/{order['id']}", json={"status": "approved"}, headers=worker
    ).status_code == 403


def test_worker_cannot_change_work_a_manager_gave_them(setup):
    client = setup["client"]
    task_id, (req,) = make_task(setup, [{"minimum_evidence_count": 1}])
    worker = auth(setup["worker_token"])
    with setup["session_factory"]() as db:
        order_id = str(db.get(Task, uuid.UUID(task_id)).work_order_id)
    assert client.post(
        f"/work-orders/{order_id}/tasks",
        json={"title": "Extra task", "instructions": "x"},
        headers=worker,
    ).status_code == 403
    assert client.post(
        f"/tasks/{task_id}/requirements",
        json={"title": "Extra item", "instructions": "x"},
        headers=worker,
    ).status_code == 403
    assert client.patch(
        f"/tasks/{task_id}", json={"title": "Renamed"}, headers=worker
    ).status_code == 403


def test_worker_cannot_edit_own_task_once_it_is_with_a_reviewer(setup):
    client = setup["client"]
    _, task, item = worker_creates_work(setup)
    worker = auth(setup["worker_token"])
    assert upload_phase(setup, task["id"], "proof", None, item["id"]).status_code == 201
    assert client.post(f"/tasks/{task['id']}/submit", headers=worker).status_code == 200
    assert client.patch(
        f"/tasks/{task['id']}", json={"title": "Sneaky change"}, headers=worker
    ).status_code == 409


def test_other_workers_cannot_see_or_touch_self_created_work(setup):
    client = setup["client"]
    order, task, _ = worker_creates_work(setup)
    other = auth(create_access_token(str(setup["other_worker_id"])))
    assert client.get("/work-orders", headers=other).json() == []
    assert client.post(
        f"/work-orders/{order['id']}/tasks",
        json={"title": "Intruder", "instructions": "x"}, headers=other,
    ).status_code == 404
    assert client.patch(
        f"/tasks/{task['id']}", json={"title": "Intruder"}, headers=other
    ).status_code == 404


# ---------- nobody reviews their own work ----------

def test_manager_can_review_self_created_work(setup):
    client = setup["client"]
    _, task, item = worker_creates_work(setup)
    upload_phase(setup, task["id"], "proof", None, item["id"])
    client.post(f"/tasks/{task['id']}/submit", headers=auth(setup["worker_token"]))
    _, reviewer = new_user(setup, "manager", "Ian")
    done = client.post(
        f"/tasks/{task['id']}/reviews",
        json={"decision": "approved", "reason": "Looks right"},
        headers=auth(reviewer),
    )
    assert done.status_code == 201, done.text


def test_reviewer_who_created_the_work_is_refused(setup):
    client = setup["client"]
    _, task, item = worker_creates_work(setup)
    upload_phase(setup, task["id"], "proof", None, item["id"])
    client.post(f"/tasks/{task['id']}/submit", headers=auth(setup["worker_token"]))
    reviewer_id, reviewer = new_user(setup, "manager", "Ian")
    with setup["session_factory"]() as db:
        order = db.get(WorkOrder, db.get(Task, uuid.UUID(task["id"])).work_order_id)
        order.created_by = reviewer_id  # as if the creator later became an reviewer
        db.commit()
    refused = client.post(
        f"/tasks/{task['id']}/reviews",
        json={"decision": "approved", "reason": "My own work"},
        headers=auth(reviewer),
    )
    assert refused.status_code == 403
    assert "created" in refused.json()["detail"]


def test_reviewer_who_uploaded_evidence_is_refused(setup):
    client = setup["client"]
    task_id, (req,) = make_task(setup, [{"minimum_evidence_count": 1}])
    manager = auth(setup["manager_token"])
    assert upload_phase(setup, task_id, "mgr", None, req, token=setup["manager_token"]).status_code == 201
    assert client.post(f"/tasks/{task_id}/submit", headers=manager).status_code == 200
    refused = client.post(
        f"/tasks/{task_id}/reviews",
        json={"decision": "approved", "reason": "Mine"}, headers=manager,
    )
    assert refused.status_code == 403
    _, reviewer = new_user(setup, "manager", "Ian")
    assert client.post(
        f"/tasks/{task_id}/reviews",
        json={"decision": "approved", "reason": "Fine"}, headers=auth(reviewer),
    ).status_code == 201


# ---------- workers run analysis on their own evidence ----------

def test_worker_runs_analysis_on_own_video(setup, mock_ai, tmp_path):  # noqa: F811
    task_id, (req,) = make_task(setup, [{"response_type": "video", "minimum_evidence_count": 1}])
    video = upload_video(setup, task_id, req, tmp_path)
    run = setup["client"].post(
        f"/evidence/{video['id']}/analyze", json={}, headers=auth(setup["worker_token"])
    )
    assert run.status_code == 200, run.text
    assert run.json()["status"] == "completed"
    other = auth(create_access_token(str(setup["other_worker_id"])))
    assert setup["client"].post(
        f"/evidence/{video['id']}/analyze", json={}, headers=other
    ).status_code == 404


def test_worker_cannot_analyse_a_file_someone_else_uploaded(setup):
    task_id, (req,) = make_task(setup, [{"response_type": "video", "minimum_evidence_count": 1}])
    add_video(setup, task_id, req, confidence=0.9, findings={})
    listed = setup["client"].get(f"/tasks/{task_id}/evidence", headers=auth(setup["manager_token"])).json()
    evidence_id = listed[0]["id"]
    with setup["session_factory"]() as db:
        from app.models import Evidence

        row = db.get(Evidence, uuid.UUID(evidence_id))
        row.submitted_by = setup["other_worker_id"]
        db.commit()
    blocked = setup["client"].post(
        f"/evidence/{evidence_id}/analyze", json={}, headers=auth(setup["worker_token"])
    )
    assert blocked.status_code == 404
    # A manager still can.
    allowed = setup["client"].post(
        f"/evidence/{evidence_id}/analyze", json={}, headers=auth(setup["manager_token"])
    )
    assert allowed.status_code == 422  # this test row has no duration; access was fine


def test_worker_analysis_is_limited_per_hour(setup, monkeypatch):
    monkeypatch.setenv("WORKER_ANALYSIS_PER_HOUR", "1")
    get_settings.cache_clear()
    try:
        task_id, (req,) = make_task(setup, [{"response_type": "video", "minimum_evidence_count": 1}])
        add_video(setup, task_id, req, confidence=0.9, findings={})  # one run already saved
        evidence_id = setup["client"].get(
            f"/tasks/{task_id}/evidence", headers=auth(setup["manager_token"])
        ).json()[0]["id"]
        limited = setup["client"].post(
            f"/evidence/{evidence_id}/analyze", json={}, headers=auth(setup["worker_token"])
        )
        assert limited.status_code == 429
        assert limited.headers["Retry-After"] == "600"
    finally:
        get_settings.cache_clear()


# ---------- challenge code ----------

def test_challenge_code_is_stable_until_rotated(setup):
    client = setup["client"]
    task_id, _ = make_task(setup, [{"minimum_evidence_count": 1}])
    worker = auth(setup["worker_token"])
    first = client.get(f"/tasks/{task_id}/challenge", headers=worker).json()
    assert re.fullmatch(r"[A-Z]+ \d{3}", first["code"])
    assert client.get(f"/tasks/{task_id}/challenge", headers=worker).json()["code"] == first["code"]

    codes = {first["code"]}
    for _ in range(5):
        codes.add(client.post(f"/tasks/{task_id}/challenge/rotate", headers=worker).json()["code"])
    assert len(codes) > 1

    other = auth(create_access_token(str(setup["other_worker_id"])))
    assert client.get(f"/tasks/{task_id}/challenge", headers=other).status_code == 404
    assert client.get(f"/tasks/{task_id}/challenge").status_code == 401


def test_challenge_code_roles_and_locked_states(setup):
    client = setup["client"]
    task_id, (req,) = make_task(setup, [{"minimum_evidence_count": 1}])
    _, reviewer = new_user(setup, "manager", "Ian")
    assert client.get(f"/tasks/{task_id}/challenge", headers=auth(reviewer)).status_code == 200
    upload_phase(setup, task_id, "p", None, req)
    client.post(f"/tasks/{task_id}/submit", headers=auth(setup["worker_token"]))
    assert client.post(
        f"/tasks/{task_id}/challenge/rotate", headers=auth(setup["worker_token"])
    ).status_code == 409


# ---------- score storage ----------

@pytest.mark.parametrize(
    "score,band",
    [(None, "not_scored"), (100, "strong"), (85, "strong"), (84, "check"),
     (60, "check"), (59, "weak"), (0, "weak")],
)
def test_score_bands(score, band):
    assert band_for(score) == band


def save(setup, task_id, items, **kwargs):
    with setup["session_factory"]() as db:
        save_score_set(
            db, db.get(Task, uuid.UUID(task_id)), items,
            model_name="test-model", model_version="1", **kwargs,
        )
        db.commit()


def item(req, score, *reasons):
    return {
        "requirement_id": uuid.UUID(req), "score": score, "reasons": list(reasons),
        "parts": [{"key": "vision", "label": "Before/after match", "score": score, "detail": "x"}],
    }


def test_no_score_yet(setup):
    task_id, _ = make_task(setup, [{"minimum_evidence_count": 1}])
    body = setup["client"].get(f"/tasks/{task_id}/score", headers=auth(setup["worker_token"])).json()
    assert body["scored"] is False
    assert body["task"] is None and body["items"] == []


def test_task_score_is_the_lowest_item_and_latest_set_wins(setup):
    task_id, (a, b) = make_task(setup, [{"title": "One"}, {"title": "Two"}])
    save(setup, task_id, [item(a, 95, "Clear"), item(b, 70, "Part hidden")])
    body = setup["client"].get(f"/tasks/{task_id}/score", headers=auth(setup["worker_token"])).json()
    assert body["scored"] is True
    assert body["task"]["score"] == 70 and body["task"]["band"] == "check"
    assert {i["requirement_id"]: i["score"] for i in body["items"]} == {a: 95, b: 70}
    assert body["model_name"] == "test-model"
    assert body["items"][0]["parts"][0]["label"] == "Before/after match"

    save(setup, task_id, [item(a, 40, "Wrong part"), item(b, 90)])
    again = setup["client"].get(f"/tasks/{task_id}/score", headers=auth(setup["manager_token"])).json()
    assert again["task"]["score"] == 40 and again["task"]["band"] == "weak"
    assert len(again["items"]) == 2  # the older set is not mixed in


def test_unscored_item_and_failed_integrity_cap_the_score(setup):
    task_id, (a, b) = make_task(setup, [{"title": "One"}, {"title": "Two"}])
    save(setup, task_id, [item(a, 99), {"requirement_id": uuid.UUID(b), "score": None}])
    body = setup["client"].get(f"/tasks/{task_id}/score", headers=auth(setup["manager_token"])).json()
    assert body["task"]["score"] == 84 and body["task"]["band"] == "check"
    unscored = next(i for i in body["items"] if i["requirement_id"] == b)
    assert unscored["band"] == "not_scored" and unscored["reasons"]

    save(setup, task_id, [item(a, 99), item(b, 98)], integrity_failed=True)
    capped = setup["client"].get(f"/tasks/{task_id}/score", headers=auth(setup["manager_token"])).json()
    assert capped["task"]["score"] == 30 and capped["task"]["band"] == "weak"

    save(setup, task_id, [{"requirement_id": uuid.UUID(a), "score": None}])
    nothing = setup["client"].get(f"/tasks/{task_id}/score", headers=auth(setup["manager_token"])).json()
    assert nothing["scored"] is False and nothing["task"]["band"] == "not_scored"


def test_score_is_only_visible_to_people_who_can_see_the_task(setup):
    task_id, (a,) = make_task(setup, [{"minimum_evidence_count": 1}])
    save(setup, task_id, [item(a, 80)])
    other = auth(create_access_token(str(setup["other_worker_id"])))
    assert setup["client"].get(f"/tasks/{task_id}/score", headers=other).status_code == 404
    assert setup["client"].get(f"/tasks/{task_id}/score").status_code == 401


# ---------- names on every response ----------

def test_responses_carry_names_for_every_role(setup):
    client = setup["client"]
    task_id, _ = make_task(setup, [{"minimum_evidence_count": 1}])
    for token in (setup["worker_token"], setup["manager_token"], new_user(setup, "manager", "Ian")[1]):
        orders = client.get("/work-orders", headers=auth(token)).json()
        assert orders[0]["created_by_name"] == "Evidence Manager"
        assert orders[0]["assigned_to_name"] == "Evidence Worker"
        assert orders[0]["is_self_created"] is False
        tasks = client.get(f"/work-orders/{orders[0]['id']}/tasks", headers=auth(token)).json()
        assert tasks[0]["assigned_by_name"] == "Evidence Manager"
        assert tasks[0]["assigned_to_name"] == "Evidence Worker"
    me = client.get("/auth/me", headers=auth(setup["worker_token"])).json()
    assert me["role"] == "worker"


# ---------- manager adds a team member ----------

def test_manager_adds_a_team_member_who_can_sign_in(setup):
    client = setup["client"]
    manager = auth(setup["manager_token"])
    body = {
        "email": "New.Reviewer@example.com", "full_name": "Nina Reviewer",
        "password": "Starting-Password-2026", "role": "manager",
    }
    created = client.post("/users", json=body, headers=manager)
    assert created.status_code == 201, created.text
    assert created.json()["role"] == "manager"
    assert created.json()["email"] == "new.reviewer@example.com"
    login = client.post(
        "/auth/login",
        json={"email": "new.reviewer@example.com", "password": body["password"]},
    )
    assert login.status_code == 200

    assert client.post("/users", json=body, headers=manager).status_code == 409
    assert client.post(
        "/users", json={**body, "email": "x@example.com", "password": "short"}, headers=manager
    ).status_code == 422
    assert client.post(
        "/users", json={**body, "email": "y@example.com"}, headers=auth(setup["worker_token"])
    ).status_code == 403
    assert client.post("/users", json=body).status_code == 401


# ---------- seed ----------

def test_seed_v2_adds_a_self_created_task_and_sample_scores(setup):
    from app.seed import seed, seed_v2

    with setup["session_factory"]() as db:
        assert seed(db, setup["storage_dir"]) is not None
        assert seed_v2(db, setup["storage_dir"]) is True
        assert seed_v2(db, setup["storage_dir"]) is False  # safe to run twice
        titles = {t.title: t.id for t in db.query(Task).all()}

    client = setup["client"]
    login = client.post(
        "/auth/login",
        json={"email": "worker@proofline.demo", "password": "Proofline-Demo-2026"},
    )
    worker = auth(login.json()["access_token"])
    valve = client.get(f"/tasks/{titles['Check the relief valve']}/score", headers=worker).json()
    assert valve["task"]["score"] == 48 and valve["task"]["band"] == "weak"
    gauge = client.get(f"/tasks/{titles['Read the pressure gauge']}/score", headers=worker).json()
    assert gauge["task"]["band"] == "strong"

    own = titles["Check the extinguisher gauge"]
    evidence = client.get(f"/tasks/{own}/evidence", headers=worker).json()
    assert sorted(e["phase"] for e in evidence) == ["after", "before"]
    assert client.post(f"/tasks/{own}/submit", headers=worker).status_code == 200
    mine = client.get("/work-orders", headers=worker).json()
    assert any(o["is_self_created"] for o in mine)
