import hashlib
import subprocess
import uuid
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.core.rate_limit import limiter
from conftest import auth
from test_verification_engine import add_task, make_task, verification
from test_workflow_routes import make_reviewer, order_id_of, upload

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def mock_ai(monkeypatch):
    monkeypatch.setenv("MODEL_MOCK", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def make_video_file(path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=4:size=320x240:rate=10",
         "-pix_fmt", "yuv420p", str(path)],
        check=True,
    )


def upload_video(setup, task_id, requirement_id, tmp_path):
    path = tmp_path / "clip.mp4"
    make_video_file(path)
    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": ("clip.mp4", path.read_bytes(), "video/mp4")},
        data={"requirement_id": requirement_id},
    )
    assert response.status_code == 201, response.text
    return response.json()


# ---------- hardening ----------

def test_security_headers_and_request_id(setup):
    response = setup["client"].get("/health", headers={"X-Request-ID": "abc12345def"})
    assert response.headers["X-Request-ID"] == "abc12345def"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    generated = setup["client"].get("/health").headers["X-Request-ID"]
    assert len(generated) == 32


def test_login_is_rate_limited(setup):
    body = {"email": "nobody@example.com", "password": "wrong-password-123"}
    codes = [setup["client"].post("/auth/login", json=body).status_code for _ in range(12)]
    assert codes[:10] == [401] * 10
    assert codes[10:] == [429, 429]
    blocked = setup["client"].post("/auth/login", json=body)
    assert int(blocked.headers["Retry-After"]) >= 1
    limiter.reset()
    assert setup["client"].post("/auth/login", json=body).status_code == 401


def test_rate_limit_can_be_switched_off(setup, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
    get_settings.cache_clear()
    try:
        body = {"email": "nobody@example.com", "password": "wrong-password-123"}
        codes = {setup["client"].post("/auth/login", json=body).status_code for _ in range(12)}
        assert codes == {401}
    finally:
        get_settings.cache_clear()


def test_cors_only_for_listed_origins(setup, monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com")
    get_settings.cache_clear()
    try:
        from fastapi.testclient import TestClient
        import importlib
        import app.main as main

        importlib.reload(main)
        client = TestClient(main.app)
        ok = client.options(
            "/health",
            headers={"Origin": "https://app.example.com", "Access-Control-Request-Method": "GET"},
        )
        bad = client.options(
            "/health",
            headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "GET"},
        )
        assert ok.headers.get("access-control-allow-origin") == "https://app.example.com"
        assert "access-control-allow-origin" not in bad.headers
    finally:
        monkeypatch.delenv("CORS_ORIGINS")
        get_settings.cache_clear()
        import app.main as main
        import importlib

        importlib.reload(main)


# ---------- mock AI, end to end ----------

def test_mock_ai_runs_the_whole_video_flow(setup, mock_ai, tmp_path):
    task_id, (req,) = make_task(setup, [{"response_type": "video", "minimum_evidence_count": 1}])
    video = upload_video(setup, task_id, req, tmp_path)
    client = setup["client"]
    manager = auth(setup["manager_token"])

    run = client.post(f"/evidence/{video['id']}/analyze", json={}, headers=manager)
    assert run.status_code == 200, run.text
    assert run.json()["status"] == "completed"
    assert run.json()["confidence"] == 0.88

    body = verification(setup, task_id)
    assert body["decision"] == "VERIFIED"
    assert body["requirement_results"][0]["timestamps_seconds"]


def test_mock_ai_segmentation_and_transcription(setup, mock_ai):
    task_id, (req,) = make_task(setup, [{"minimum_evidence_count": 1}])
    evidence = upload(setup, task_id, "pic", req)
    client = setup["client"]

    # The sample photo is not a real image, so use real image bytes.
    from io import BytesIO
    from PIL import Image

    out = BytesIO()
    Image.new("RGB", (64, 64), (200, 30, 30)).save(out, format="PNG")
    real = client.post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": ("real.png", out.getvalue(), "image/png")},
    ).json()
    seg = client.post(
        f"/evidence/{real['id']}/segment",
        json={"prompt": "red square"},
        headers=auth(setup["manager_token"]),
    )
    assert seg.status_code == 200, seg.text
    assert len(seg.json()["boxes"]) == 1
    assert evidence["id"]

    wav = (FIXTURES / "transcription-test-16k.wav").read_bytes()
    spoken = client.post(
        f"/tasks/{task_id}/transcribe",
        headers=auth(setup["worker_token"]),
        files={"file": ("note.wav", wav, "audio/wav")},
    )
    assert spoken.status_code == 200, spoken.text
    assert spoken.json()["transcript"].startswith("Mock transcript")

    audit = client.get(
        f"/work-orders/{order_id_of(setup, task_id)}/audit",
        headers=auth(setup["manager_token"]),
    ).json()
    assert "audio.transcribed" in {e["action"] for e in audit}


def test_transcribe_validation_and_access(setup, mock_ai):
    task_id, _ = make_task(setup)
    client = setup["client"]
    worker = auth(setup["worker_token"])
    not_wav = client.post(
        f"/tasks/{task_id}/transcribe", headers=worker,
        files={"file": ("note.wav", b"not audio at all", "audio/wav")},
    )
    assert not_wav.status_code == 415
    wav = (FIXTURES / "transcription-test-16k.wav").read_bytes()
    from app.core.security import create_access_token

    other = auth(create_access_token(str(setup["other_worker_id"])))
    assert client.post(
        f"/tasks/{task_id}/transcribe", headers=other,
        files={"file": ("note.wav", wav, "audio/wav")},
    ).status_code == 404


def test_ai_routes_answer_503_without_key_or_mock(setup, tmp_path, monkeypatch):
    monkeypatch.delenv("MODEL_MOCK", raising=False)
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    get_settings.cache_clear()
    # Settings also load the repository .env file, so clear that value from
    # the cached object to make this test independent of local credentials.
    monkeypatch.setattr(get_settings(), "model_api_key", None)
    wav = (FIXTURES / "transcription-test-16k.wav").read_bytes()
    task_id, _ = make_task(setup)
    response = setup["client"].post(
        f"/tasks/{task_id}/transcribe",
        headers=auth(setup["worker_token"]),
        files={"file": ("note.wav", wav, "audio/wav")},
    )
    assert response.status_code == 503


# ---------- background analysis ----------

def test_background_analysis_runs_and_blocks_a_second_start(setup, mock_ai, tmp_path, monkeypatch):
    import app.api.ai_jobs as jobs

    monkeypatch.setattr(jobs, "get_session_factory", lambda: setup["session_factory"])
    task_id, (req,) = make_task(setup, [{"response_type": "video", "minimum_evidence_count": 1}])
    video = upload_video(setup, task_id, req, tmp_path)
    client = setup["client"]
    manager = auth(setup["manager_token"])

    started = client.post(f"/evidence/{video['id']}/analyze/background", json={}, headers=manager)
    assert started.status_code == 202
    assert started.json()["status"] == "queued"

    latest = client.get(f"/evidence/{video['id']}/analysis", headers=manager)
    assert latest.status_code == 200
    assert latest.json()["status"] == "completed"

    from datetime import datetime, timezone
    from app.models import VerificationRun

    with setup["session_factory"]() as db:
        db.add(VerificationRun(
            evidence_id=uuid.UUID(video["id"]), model_name="m", model_version="1",
            status="processing", findings={}, started_at=datetime.now(timezone.utc),
        ))
        db.commit()
    again = client.post(f"/evidence/{video['id']}/analyze/background", json={}, headers=manager)
    assert again.status_code == 409


def test_background_analysis_rejects_images_and_workers(setup):
    task_id, (req,) = make_task(setup, [{"minimum_evidence_count": 1}])
    image = upload(setup, task_id, "p", req)
    client = setup["client"]
    assert client.post(
        f"/evidence/{image['id']}/analyze/background", json={}, headers=auth(setup["manager_token"])
    ).status_code == 422
    # A worker may now analyse their own files (a photo is still the wrong type).
    assert client.post(
        f"/evidence/{image['id']}/analyze/background", json={}, headers=auth(setup["worker_token"])
    ).status_code == 422


# ---------- dashboard and notifications ----------

def test_dashboard_summary_and_notifications(setup):
    task_id, (req,) = make_task(setup, [{"minimum_evidence_count": 1}])
    client = setup["client"]
    manager = auth(setup["manager_token"])
    worker = auth(setup["worker_token"])
    upload(setup, task_id, "a", req)

    note = client.get("/notifications", headers=worker).json()
    assert [n["kind"] for n in note] == []  # task is in progress, nothing sent back

    client.post(f"/tasks/{task_id}/submit", headers=worker)
    summary = client.get("/dashboard/summary", headers=manager).json()
    assert summary["tasks"]["submitted"] == 1
    assert summary["awaiting_review"] == 1
    assert summary["tasks_total"] == 1

    items = client.get("/notifications", headers=manager).json()
    assert items[0]["kind"] == "review_needed"
    assert items[0]["task_id"] == task_id

    reviewer = auth(make_reviewer(setup))
    client.post(
        f"/tasks/{task_id}/reviews",
        json={"decision": "needs_more_evidence", "reason": "Label is blurry"},
        headers=reviewer,
    )
    back = client.get("/notifications", headers=worker).json()
    assert back[0]["kind"] == "sent_back"
    assert back[0]["detail"] == "Label is blurry"
    assert client.get("/notifications", headers=manager).json() == []
    assert client.get("/dashboard/summary").status_code == 401


def test_worker_summary_only_counts_own_work(setup):
    make_task(setup)
    from app.core.security import create_access_token

    other = auth(create_access_token(str(setup["other_worker_id"])))
    mine = setup["client"].get("/dashboard/summary", headers=auth(setup["worker_token"])).json()
    theirs = setup["client"].get("/dashboard/summary", headers=other).json()
    assert mine["tasks_total"] == 1
    assert theirs["tasks_total"] == 0


# ---------- demo seed ----------

def test_seed_builds_a_consistent_demo(setup, tmp_path):
    from app.models import Task, User
    from app.seed import seed

    with setup["session_factory"]() as db:
        result = seed(db, setup["storage_dir"])
        assert result is not None
        assert seed(db, setup["storage_dir"]) is None  # safe to run twice

    client = setup["client"]
    login = client.post(
        "/auth/login",
        json={"email": "manager@proofline.demo", "password": result["password"]},
    )
    assert login.status_code == 200
    manager = auth(login.json()["access_token"])
    summary = client.get("/dashboard/summary", headers=manager).json()
    assert summary["tasks"]["approved"] == 1
    assert summary["tasks"]["submitted"] >= 1
    assert summary["tasks"]["pending"] == 1
    assert summary["evidence_issues"]["flagged"] >= 1

    with setup["session_factory"]() as db:
        titles = {t.title: t.id for t in db.query(Task).all()}
    valve = verification(setup, str(titles["Check the relief valve"]))
    assert valve["decision"] == "NEEDS_HUMAN_REVIEW"
    meter = verification(setup, str(titles["Record the meter reading"]))
    assert meter["decision"] == "NEEDS_MORE_EVIDENCE"
