import hashlib
import uuid

from app.core.security import create_access_token
from app.models.evidence import Evidence
from conftest import auth, create_task_for_worker


def test_worker_can_upload_png_and_receives_hash(setup):
    task_id = create_task_for_worker(setup)
    content = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"test-image-data"

    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": ("equipment.png", content, "image/png")},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["task_id"] == task_id
    assert body["submitted_by"] == str(setup["worker_id"])
    assert body["media_type"] == "image"
    assert body["content_type"] == "image/png"
    assert body["size_bytes"] == len(content)
    assert body["sha256_hash"] == hashlib.sha256(content).hexdigest()
    assert body["integrity_status"] == "pending"
    assert "storage_key" not in body

    stored_files = list(setup["storage_dir"].iterdir())
    assert len(stored_files) == 1
    assert stored_files[0].read_bytes() == content


def test_upload_rejects_invalid_file_signature(setup):
    task_id = create_task_for_worker(setup)

    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": ("fake.png", b"not a PNG file", "image/png")},
    )

    assert response.status_code == 415
    assert list(setup["storage_dir"].iterdir()) == []


def test_upload_rejects_mismatched_content_type(setup):
    task_id = create_task_for_worker(setup)
    content = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"data"

    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": ("photo.png", content, "image/jpeg")},
    )

    assert response.status_code == 415
    assert list(setup["storage_dir"].iterdir()) == []


def test_upload_requires_authentication(setup):
    task_id = create_task_for_worker(setup)
    content = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"data"

    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        files={"file": ("photo.png", content, "image/png")},
    )

    assert response.status_code == 401
    assert list(setup["storage_dir"].iterdir()) == []


def test_worker_cannot_upload_to_another_workers_task(setup):
    task_id = create_task_for_worker(
        setup, assigned_to=setup["other_worker_id"]
    )
    content = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"data"

    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": ("photo.png", content, "image/png")},
    )

    assert response.status_code == 404
    assert list(setup["storage_dir"].iterdir()) == []


def test_upload_rejects_unsupported_extension(setup):
    task_id = create_task_for_worker(setup)

    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": ("document.pdf", b"%PDF-1.7 test", "application/pdf")},
    )

    assert response.status_code == 415
    assert list(setup["storage_dir"].iterdir()) == []


def test_worker_can_upload_mp4_video(setup, monkeypatch):
    # Mock FFprobe because this test uses synthetic, non-playable MP4 bytes.
    monkeypatch.setattr(
        "app.api.evidence._probe_video",
        lambda path: {
            "format_name": "mov,mp4",
            "duration_seconds": 1.0,
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 320,
                    "height": 240,
                }
            ],
        },
    )
    task_id = create_task_for_worker(setup)
    content = b"\x00\x00\x00\x18ftypisom" + b"test-video-data"

    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": ("inspection.mp4", content, "video/mp4")},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["media_type"] == "video"
    assert body["content_type"] == "video/mp4"
    assert body["media_metadata"]["format_name"] == "mov,mp4"
    assert body["media_metadata"]["duration_seconds"] == 1.0
    assert body["media_metadata"]["streams"][0]["codec_name"] == "h264"
    assert body["media_metadata"]["streams"][0]["width"] == 320
    assert body["media_metadata"]["streams"][0]["height"] == 240
    assert body["size_bytes"] == len(content)
    assert body["sha256_hash"] == hashlib.sha256(content).hexdigest()

    stored_files = list(setup["storage_dir"].iterdir())
    assert len(stored_files) == 1
    assert stored_files[0].read_bytes() == content


def test_oversized_image_is_rejected_and_partial_file_removed(setup, monkeypatch):
    import app.api.evidence as evidence_api

    monkeypatch.setattr(evidence_api, "IMAGE_LIMIT", 16)

    task_id = create_task_for_worker(setup)
    content = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"extra-data"

    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": ("large.png", content, "image/png")},
    )

    assert response.status_code == 413
    assert list(setup["storage_dir"].iterdir()) == []

def _create_requirement(setup, task_id, maximum_evidence_count=2):
    from app.models.requirement import Requirement

    with setup["session_factory"]() as db:
        requirement = Requirement(
            task_id=uuid.UUID(task_id),
            title="Equipment condition photo",
            instructions="Capture the equipment clearly.",
            response_type="photo",
            is_required=True,
            position=0,
            minimum_evidence_count=0,
            maximum_evidence_count=maximum_evidence_count,
            required_viewpoints=[],
            requires_human_inspection=False,
        )
        db.add(requirement)
        db.commit()
        db.refresh(requirement)
        return str(requirement.id)


def _valid_png():
    return b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"test-image-data"

def test_evidence_links_to_requirement(setup):
    task_id = create_task_for_worker(setup)
    requirement_id = _create_requirement(setup, task_id)

    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        data={"requirement_id": requirement_id},
        files={"file": ("equipment.png", _valid_png(), "image/png")},
    )

    assert response.status_code == 201, response.text
    assert response.json()["requirement_id"] == requirement_id


def test_upload_rejects_requirement_from_another_task(setup):
    task_id = create_task_for_worker(setup)
    other_task_id = create_task_for_worker(setup)
    other_requirement_id = _create_requirement(setup, other_task_id)

    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        data={"requirement_id": other_requirement_id},
        files={"file": ("equipment.png", _valid_png(), "image/png")},
    )

    assert response.status_code == 404
    assert list(setup["storage_dir"].iterdir()) == []


def test_upload_enforces_requirement_maximum_evidence_count(setup):
    task_id = create_task_for_worker(setup)
    requirement_id = _create_requirement(setup, task_id, maximum_evidence_count=1)

    first = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        data={"requirement_id": requirement_id},
        files={"file": ("first.png", _valid_png(), "image/png")},
    )
    assert first.status_code == 201, first.text

    second = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        data={"requirement_id": requirement_id},
        files={"file": ("second.png", _valid_png(), "image/png")},
    )

    assert second.status_code == 409, second.text
    assert len(list(setup["storage_dir"].iterdir())) == 1


def _upload_png_for_retrieval(setup):
    task_id = create_task_for_worker(setup)
    content = _valid_png()
    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": ("retrieval-test.png", content, "image/png")},
    )
    assert response.status_code == 201, response.text
    return response.json(), content


def test_evidence_metadata_can_be_retrieved(setup):
    uploaded, _ = _upload_png_for_retrieval(setup)

    response = setup["client"].get(
        f"/evidence/{uploaded['id']}",
        headers=auth(setup["worker_token"]),
    )

    assert response.status_code == 200, response.text
    assert response.json()["id"] == uploaded["id"]
    assert response.json()["sha256_hash"] == uploaded["sha256_hash"]
    assert response.json()["integrity_status"] == "pending"



def test_other_worker_cannot_access_evidence_metadata_or_content(setup):
    uploaded, _ = _upload_png_for_retrieval(setup)
    other_worker_token = create_access_token(
        str(setup["other_worker_id"])
    )
    headers = auth(other_worker_token)

    metadata_response = setup["client"].get(
        f"/evidence/{uploaded['id']}",
        headers=headers,
    )
    content_response = setup["client"].get(
        f"/evidence/{uploaded['id']}/content",
        headers=headers,
    )

    assert metadata_response.status_code == 404
    assert content_response.status_code == 404

def test_download_returns_original_bytes_and_passes_integrity(setup):
    uploaded, original_content = _upload_png_for_retrieval(setup)

    response = setup["client"].get(
        f"/evidence/{uploaded['id']}/content",
        headers=auth(setup["worker_token"]),
    )

    assert response.status_code == 200, response.text
    assert response.content == original_content
    assert response.headers["content-type"].startswith("image/png")

    with setup["session_factory"]() as db:
        evidence = db.get(Evidence, uuid.UUID(uploaded["id"]))
        assert evidence.integrity_status == "passed"


def test_download_rejects_modified_file_and_marks_failed(setup):
    uploaded, _ = _upload_png_for_retrieval(setup)
    stored_file = next(setup["storage_dir"].iterdir())
    stored_file.write_bytes(b"modified evidence")

    response = setup["client"].get(
        f"/evidence/{uploaded['id']}/content",
        headers=auth(setup["worker_token"]),
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Evidence integrity check failed"

    with setup["session_factory"]() as db:
        evidence = db.get(Evidence, uuid.UUID(uploaded["id"]))
        assert evidence.integrity_status == "failed"


def test_download_rejects_missing_file_and_marks_failed(setup):
    uploaded, _ = _upload_png_for_retrieval(setup)
    stored_file = next(setup["storage_dir"].iterdir())
    stored_file.unlink()

    response = setup["client"].get(
        f"/evidence/{uploaded['id']}/content",
        headers=auth(setup["worker_token"]),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Stored evidence file not found"

    with setup["session_factory"]() as db:
        evidence = db.get(Evidence, uuid.UUID(uploaded["id"]))
        assert evidence.integrity_status == "failed"
