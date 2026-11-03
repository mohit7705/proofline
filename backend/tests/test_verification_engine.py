import uuid
from datetime import datetime, timezone

from app.core.security import create_access_token
from app.models import Evidence, TaskVerification, VerificationRun
from conftest import auth
from test_workflow_routes import make_reviewer, order_id_of, png, upload


def make_task(setup, requirements=None):
    """A task for the worker with optional checklist items."""
    client = setup["client"]
    manager = auth(setup["manager_token"])
    order = client.post(
        "/work-orders",
        json={
            "title": "Inspect equipment",
            "description": "Check it",
            "assigned_to": str(setup["worker_id"]),
        },
        headers=manager,
    ).json()
    return add_task(setup, order["id"], requirements)


def add_task(setup, order_id, requirements=None):
    client = setup["client"]
    manager = auth(setup["manager_token"])
    task = client.post(
        f"/work-orders/{order_id}/tasks",
        json={
            "title": "Capture equipment",
            "instructions": "Show the equipment",
            "assigned_to": str(setup["worker_id"]),
        },
        headers=manager,
    ).json()
    ids = []
    for item in requirements or []:
        body = {"title": "Item", "instructions": "Show it", "response_type": "photo", **item}
        response = client.post(f"/tasks/{task['id']}/requirements", json=body, headers=manager)
        assert response.status_code == 201, response.text
        ids.append(response.json()["id"])
    return task["id"], ids


def verification(setup, task_id, token=None, method="get"):
    call = getattr(setup["client"], method)
    response = call(
        f"/tasks/{task_id}/verification", headers=auth(token or setup["manager_token"])
    )
    assert response.status_code == 200, response.text
    return response.json()


def add_video(setup, task_id, requirement_id, *, confidence, findings, status="completed"):
    """A video evidence row with a saved AI analysis run (no model call)."""
    key = f"{uuid.uuid4().hex}.mp4"
    content = key.encode()
    (setup["storage_dir"] / key).write_bytes(content)
    import hashlib

    with setup["session_factory"]() as db:
        evidence = Evidence(
            task_id=uuid.UUID(task_id),
            requirement_id=uuid.UUID(requirement_id),
            submitted_by=setup["worker_id"],
            media_type="video",
            storage_key=key,
            original_filename="clip.mp4",
            content_type="video/mp4",
            size_bytes=len(content),
            sha256_hash=hashlib.sha256(content).hexdigest(),
            integrity_status="pending",
        )
        db.add(evidence)
        db.flush()
        db.add(
            VerificationRun(
                evidence_id=evidence.id,
                model_name="m",
                model_version="1",
                status=status,
                findings=findings,
                confidence=confidence,
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
            )
        )
        db.commit()


def obs(relevance, at=3.0):
    return {
        "observations": [
            {"observation_id": "o1", "timestamp_seconds": at, "observation": "x",
             "relevance": relevance, "supporting_frame_ids": ["f1"], "limitations": []}
        ],
        "flags": [],
    }


def test_empty_task_needs_more_evidence_with_follow_up(setup):
    task_id, _ = make_task(setup, [{"title": "Valve label", "minimum_evidence_count": 1}])
    body = verification(setup, task_id)
    assert body["decision"] == "NEEDS_MORE_EVIDENCE"
    assert body["requirement_results"][0]["decision"] == "NEEDS_MORE_EVIDENCE"
    assert body["follow_up"]["attempts_left"] == 3
    assert "Valve label" in body["follow_up"]["instruction"]


def test_photos_that_pass_checks_are_verified_and_stored_on_submit(setup):
    task_id, (req,) = make_task(setup, [{"title": "Label", "minimum_evidence_count": 1}])
    upload(setup, task_id, "a", req)
    setup["client"].post(f"/tasks/{task_id}/submit", headers=auth(setup["worker_token"]))

    body = verification(setup, task_id, setup["worker_token"])
    assert body["decision"] == "VERIFIED"
    assert body["follow_up"] is None
    assert body["requirement_results"][0]["evidence_ids"]

    with setup["session_factory"]() as db:
        rows = db.query(TaskVerification).filter_by(task_id=uuid.UUID(task_id)).all()
        assert [r.trigger for r in rows] == ["submit"]

    audit = setup["client"].get(
        f"/work-orders/{order_id_of(setup, task_id)}/audit",
        headers=auth(setup["manager_token"]),
    ).json()
    assert "verification.completed" in {e["action"] for e in audit}


def test_tampered_file_fails_inspection(setup):
    task_id, (req,) = make_task(setup, [{"title": "Label", "minimum_evidence_count": 1}])
    upload(setup, task_id, "a", req)
    assert verification(setup, task_id)["decision"] == "VERIFIED"

    next(setup["storage_dir"].iterdir()).write_bytes(b"changed")
    body = verification(setup, task_id, method="post")
    assert body["decision"] == "FAILED_INSPECTION"
    assert any(s["severity"] == "critical" for s in body["integrity_signals"])


def test_duplicate_file_in_another_task_needs_human_review_and_is_flagged(setup):
    first, (req1,) = make_task(setup, [{"minimum_evidence_count": 1}])
    order_id = order_id_of(setup, first)
    second, (req2,) = add_task(setup, order_id, [{"minimum_evidence_count": 1}])
    upload(setup, first, "same", req1)
    upload(setup, second, "same", req2)

    body = verification(setup, second)
    assert body["decision"] == "NEEDS_HUMAN_REVIEW"
    assert any(s["label"] == "Duplicate file" for s in body["integrity_signals"])
    flagged = setup["client"].get(
        f"/tasks/{second}/evidence", headers=auth(setup["manager_token"])
    ).json()
    assert flagged[0]["integrity_status"] == "flagged"


def test_video_results_drive_the_decision(setup):
    ok, (r1,) = make_task(setup, [{"response_type": "video", "minimum_evidence_count": 1}])
    add_video(setup, ok, r1, confidence=0.9, findings=obs("relevant", 4.5))
    body = verification(setup, ok)
    assert body["decision"] == "VERIFIED"
    assert body["requirement_results"][0]["timestamps_seconds"] == [4.5]

    low, (r2,) = make_task(setup, [{"response_type": "video", "minimum_evidence_count": 1}])
    add_video(setup, low, r2, confidence=0.3, findings=obs("relevant"))
    body = verification(setup, low)
    assert body["decision"] == "NEEDS_HUMAN_REVIEW"
    assert any(s["label"] == "Low AI confidence" for s in body["integrity_signals"])

    wrong, (r3,) = make_task(setup, [{"response_type": "video", "minimum_evidence_count": 1}])
    add_video(setup, wrong, r3, confidence=0.9, findings=obs("not_relevant"))
    body = verification(setup, wrong)
    assert body["decision"] == "NEEDS_MORE_EVIDENCE"
    assert body["follow_up"] is not None

    pending, (r4,) = make_task(setup, [{"response_type": "video", "minimum_evidence_count": 1}])
    add_video(setup, pending, r4, confidence=None, findings={"error_code": "model_timeout"}, status="failed")
    assert verification(setup, pending)["decision"] == "NEEDS_HUMAN_REVIEW"


def test_human_inspection_item_never_auto_verifies(setup):
    task_id, (req,) = make_task(
        setup, [{"minimum_evidence_count": 1, "requires_human_inspection": True}]
    )
    upload(setup, task_id, "a", req)
    assert verification(setup, task_id)["decision"] == "NEEDS_HUMAN_REVIEW"


def test_follow_up_attempts_run_out_and_go_to_a_person(setup):
    task_id, (req,) = make_task(setup, [{"response_type": "video", "minimum_evidence_count": 1}])
    add_video(setup, task_id, req, confidence=0.9, findings=obs("not_relevant"))
    with setup["session_factory"]() as db:
        for _ in range(2):
            db.add(
                TaskVerification(
                    task_id=uuid.UUID(task_id), decision="NEEDS_MORE_EVIDENCE",
                    summary="x", trigger="submit", result={},
                    created_at=datetime.now(timezone.utc),
                )
            )
        db.commit()
    from app.services.verification_engine import evaluate_task
    from app.models import Task

    with setup["session_factory"]() as db:
        body = evaluate_task(db, db.get(Task, uuid.UUID(task_id)), "submit")
    assert body.decision == "NEEDS_HUMAN_REVIEW"
    assert body.follow_up is None


def test_access_rules(setup):
    task_id, _ = make_task(setup)
    other = create_access_token(str(setup["other_worker_id"]))
    client = setup["client"]
    assert client.get(f"/tasks/{task_id}/verification", headers=auth(other)).status_code == 404
    assert client.get(f"/tasks/{task_id}/verification").status_code == 401
    assert client.post(
        f"/tasks/{task_id}/verification", headers=auth(setup["worker_token"])
    ).status_code == 403
    assert client.post(
        f"/tasks/{task_id}/verification", headers=auth(make_reviewer(setup))
    ).status_code == 200


def test_escalate_keeps_task_submitted_for_a_manager(setup):
    task_id, _ = make_task(setup)
    upload(setup, task_id, "a")
    client = setup["client"]
    client.post(f"/tasks/{task_id}/submit", headers=auth(setup["worker_token"]))
    escalated = client.post(
        f"/tasks/{task_id}/reviews",
        json={"decision": "escalate", "reason": "Unsure about the weld"},
        headers=auth(make_reviewer(setup)),
    )
    assert escalated.status_code == 201, escalated.text
    again = client.post(
        f"/tasks/{task_id}/reviews",
        json={"decision": "approved", "reason": "Manager checked"},
        headers=auth(setup["manager_token"]),
    )
    assert again.status_code == 201


def test_retry_of_same_upload_returns_existing_record(setup):
    task_id, (req,) = make_task(setup, [{"minimum_evidence_count": 1}])
    first = upload(setup, task_id, "retry", req)
    repeat = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": ("retry.png", png("retry"), "image/png")},
        data={"requirement_id": req},
    )
    assert repeat.status_code == 200
    assert repeat.json()["id"] == first["id"]
    listed = setup["client"].get(
        f"/tasks/{task_id}/evidence", headers=auth(setup["worker_token"])
    ).json()
    assert len(listed) == 1
    assert len(list(setup["storage_dir"].iterdir())) == 1
