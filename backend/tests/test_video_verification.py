import asyncio
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models import Evidence, Requirement, VerificationRun
from app.schemas.video_analysis import VideoAnalysisResult
from app.services import video_verification as service
from app.services.evidence_video import EvidenceVideoError
from app.services.video_frames import ExtractedFrame


@pytest.fixture
def setup_pipeline(monkeypatch):
    evidence_id = uuid.uuid4()
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()

    user = SimpleNamespace(id=user_id, role="worker")
    task = SimpleNamespace(
        id=task_id,
        work_order_id=uuid.uuid4(),
        assigned_to=user_id,
        title="Inspect equipment",
        instructions="Show the equipment from the required angles.",
    )
    evidence = SimpleNamespace(
        id=evidence_id,
        task_id=task_id,
        requirement_id=None,
        media_type="video",
        media_metadata={"duration_seconds": 10.0},
    )

    class FakeDB:
        def __init__(self):
            self.runs = []
            self.commits = 0

        def get(self, model, record_id):
            if model is Evidence and record_id == evidence_id:
                return evidence
            if model is Requirement:
                return None
            return None

        def add(self, item):
            if isinstance(item, VerificationRun):
                self.runs.append(item)

        def commit(self):
            self.commits += 1

        def refresh(self, item):
            pass

    db = FakeDB()
    monkeypatch.setattr(service, "get_task", lambda *_: task)
    monkeypatch.setattr(service, "get_work_order", lambda *_: None)
    monkeypatch.setattr(
        service,
        "extract_authorized_evidence_frames",
        lambda **_: [
            ExtractedFrame("frame-0001", 2.0, b"\xff\xd8\xfftest", "image/jpeg")
        ],
    )

    return db, evidence, user


def success_result():
    return VideoAnalysisResult(
        status="completed",
        observations=[],
        confidence=0.87,
        flags=["missing_required_viewpoint"],
        coverage={
            "video_duration_seconds": 10.0,
            "sampled_timestamps_seconds": [2.0],
            "sampling_strategy": "manual",
        },
    )


def test_successful_verification_persists_findings(setup_pipeline, monkeypatch):
    db, _evidence, user = setup_pipeline

    async def fake_analysis(**kwargs):
        assert kwargs["request"].task_instructions
        return success_result()

    monkeypatch.setattr(service, "analyze_video_frames", fake_analysis)

    run = asyncio.run(
        service.verify_video_evidence(
            db, _evidence.id, user, [2.0]
        )
    )

    assert run.status == "completed"
    assert run.findings["status"] == "completed"
    assert run.confidence == 0.87
    assert run.findings["flags"] == ["missing_required_viewpoint"]
    assert run.findings["coverage"]["sampled_timestamps_seconds"] == [2.0]
    assert run.completed_at is not None
    assert db.commits >= 2


def test_integrity_failure_is_persisted(setup_pipeline, monkeypatch):
    db, evidence, user = setup_pipeline

    def fail_integrity(**kwargs):
        raise EvidenceVideoError(
            "integrity_check_failed", "Evidence integrity verification failed."
        )

    monkeypatch.setattr(
        service, "extract_authorized_evidence_frames", fail_integrity
    )

    run = asyncio.run(
        service.verify_video_evidence(db, evidence.id, user, [2.0])
    )

    assert run.status == "failed"
    assert run.findings["error_code"] == "integrity_failed"
    assert run.completed_at is not None


def test_model_failure_result_is_persisted(setup_pipeline, monkeypatch):
    db, evidence, user = setup_pipeline

    async def failed_analysis(**kwargs):
        return VideoAnalysisResult(status="failed", error_code="model_timeout")

    monkeypatch.setattr(service, "analyze_video_frames", failed_analysis)

    run = asyncio.run(
        service.verify_video_evidence(db, evidence.id, user, [2.0])
    )

    assert run.status == "failed"
    assert run.findings["error_code"] == "model_timeout"


def test_unauthorized_worker_creates_no_run(setup_pipeline, monkeypatch):
    db, evidence, user = setup_pipeline
    user = SimpleNamespace(id=uuid.uuid4(), role="worker")

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            service.verify_video_evidence(db, evidence.id, user, [2.0])
        )

    assert error.value.status_code == 404
    assert db.runs == []
