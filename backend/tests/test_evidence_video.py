import hashlib
import uuid
from types import SimpleNamespace

import pytest

from app.services import evidence_video
from app.services.evidence_video import (
    EvidenceVideoError,
    extract_authorized_evidence_frames,
)
from app.services.video_frames import ExtractedFrame


@pytest.fixture
def setup_video(tmp_path, monkeypatch):
    monkeypatch.setenv("EVIDENCE_STORAGE_DIR", str(tmp_path))

    content = b"synthetic-video-content"
    storage_key = "evidence-test.mp4"
    (tmp_path / storage_key).write_bytes(content)

    user_id = uuid.uuid4()
    task_id = uuid.uuid4()
    evidence_id = uuid.uuid4()

    user = SimpleNamespace(id=user_id, role="worker")
    task = SimpleNamespace(
        id=task_id,
        work_order_id=uuid.uuid4(),
        assigned_to=user_id,
    )
    evidence = SimpleNamespace(
        id=evidence_id,
        task_id=task_id,
        media_type="video",
        media_metadata={"duration_seconds": 10.0},
        storage_key=storage_key,
        sha256_hash=hashlib.sha256(content).hexdigest(),
        integrity_status="pending",
    )

    class FakeDB:
        def get(self, model, record_id):
            if record_id == evidence_id:
                return evidence
            return None

        def commit(self):
            pass

    monkeypatch.setattr(evidence_video, "get_task", lambda db, task_id: task)
    monkeypatch.setattr(
        evidence_video, "get_work_order", lambda db, work_order_id, user: None
    )

    return FakeDB(), evidence, user, tmp_path


def test_authorized_video_is_integrity_checked_before_extraction(
    setup_video, monkeypatch
):
    db, evidence, user, _ = setup_video
    expected = [
        ExtractedFrame("frame-0001", 2.0, b"\xff\xd8\xfftest")
    ]
    calls = []

    def fake_extract(**kwargs):
        calls.append(kwargs)
        return expected

    monkeypatch.setattr(evidence_video, "extract_video_frames", fake_extract)

    frames = extract_authorized_evidence_frames(
        db, evidence.id, user, [2.0]
    )

    assert frames == expected
    assert evidence.integrity_status == "passed"
    assert len(calls) == 1
    assert calls[0]["timestamps_seconds"] == [2.0]


def test_missing_evidence_is_rejected(setup_video):
    db, _evidence, user, _ = setup_video
    with pytest.raises(EvidenceVideoError) as error:
        extract_authorized_evidence_frames(
            db, uuid.uuid4(), user, [1.0]
        )
    assert error.value.code == "not_found"


def test_non_video_evidence_is_rejected(setup_video):
    db, evidence, user, _ = setup_video
    evidence.media_type = "image"

    with pytest.raises(EvidenceVideoError) as error:
        extract_authorized_evidence_frames(
            db, evidence.id, user, [1.0]
        )

    assert error.value.code == "not_video"


def test_hash_mismatch_blocks_extraction(setup_video, monkeypatch):
    db, evidence, user, _ = setup_video
    evidence.sha256_hash = "0" * 64

    def should_not_extract(**kwargs):
        pytest.fail("Extraction must not run when integrity verification fails.")

    monkeypatch.setattr(evidence_video, "extract_video_frames", should_not_extract)

    with pytest.raises(EvidenceVideoError) as error:
        extract_authorized_evidence_frames(
            db, evidence.id, user, [1.0]
        )

    assert error.value.code == "integrity_check_failed"
    assert evidence.integrity_status == "failed"


def test_wrongly_assigned_worker_is_denied(setup_video, monkeypatch):
    db, evidence, user, _ = setup_video
    task = SimpleNamespace(
        id=evidence.task_id,
        work_order_id=uuid.uuid4(),
        assigned_to=uuid.uuid4(),
    )
    monkeypatch.setattr(evidence_video, "get_task", lambda db, task_id: task)

    with pytest.raises(EvidenceVideoError) as error:
        extract_authorized_evidence_frames(
            db, evidence.id, user, [1.0]
        )

    assert error.value.code == "not_found"


def test_path_traversal_storage_key_is_rejected(setup_video):
    db, evidence, user, _ = setup_video
    evidence.storage_key = "../outside.mp4"

    with pytest.raises(EvidenceVideoError) as error:
        extract_authorized_evidence_frames(
            db, evidence.id, user, [1.0]
        )

    assert error.value.code == "file_unavailable"
