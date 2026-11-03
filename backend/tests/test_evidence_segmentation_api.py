import hashlib
import uuid

from conftest import auth, create_task_for_worker
from app.models import Evidence
from app.api import evidence as evidence_api


PNG = (
    b"\x89PNG\r\n\x1a\n"
    + b"\x00\x00\x00\rIHDR"
    + b"test-image-data"
)


def upload_image(setup):
    task_id = create_task_for_worker(setup)
    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": ("equipment.png", PNG, "image/png")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_manager_can_segment_integrity_checked_image(setup, monkeypatch):
    evidence = upload_image(setup)
    calls = {}

    async def fake_segment(image_bytes, *, content_type, prompt):
        calls["image_bytes"] = image_bytes
        calls["content_type"] = content_type
        calls["prompt"] = prompt
        return {
            "model": "sam-3.1",
            "boxes": [{"x1": 1, "y1": 2, "x2": 10, "y2": 20}],
            "encoded_masks": [],
            "mask_count": 0,
            "segments": [],
            "interpretation": "Visual aid only.",
        }

    monkeypatch.setattr(evidence_api, "segment_image", fake_segment)

    response = setup["client"].post(
        f"/evidence/{evidence['id']}/segment",
        headers=auth(setup["manager_token"]),
        json={"prompt": "equipment filter"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["evidence_id"] == evidence["id"]
    assert response.json()["integrity_status"] == "passed"
    assert response.json()["boxes"][0]["x1"] == 1
    assert calls["image_bytes"] == PNG
    assert calls["content_type"] == "image/png"
    assert calls["prompt"] == "equipment filter"


def test_worker_cannot_run_segmentation(setup, monkeypatch):
    evidence = upload_image(setup)

    async def unexpected_call(*args, **kwargs):
        raise AssertionError("Provider must not be called")

    monkeypatch.setattr(evidence_api, "segment_image", unexpected_call)

    response = setup["client"].post(
        f"/evidence/{evidence['id']}/segment",
        headers=auth(setup["worker_token"]),
        json={"prompt": "equipment"},
    )

    assert response.status_code == 403


def test_segmentation_rejects_tampered_image(setup, monkeypatch):
    evidence = upload_image(setup)
    stored = next(setup["storage_dir"].glob("*"))
    stored.write_bytes(b"tampered image")

    async def unexpected_call(*args, **kwargs):
        raise AssertionError("Provider must not be called")

    monkeypatch.setattr(evidence_api, "segment_image", unexpected_call)

    response = setup["client"].post(
        f"/evidence/{evidence['id']}/segment",
        headers=auth(setup["manager_token"]),
        json={"prompt": "equipment"},
    )

    assert response.status_code == 409
    with setup["session_factory"]() as db:
        record = db.get(Evidence, uuid.UUID(evidence["id"]))
        assert record.integrity_status == "failed"


def test_segmentation_rejects_video_evidence(setup, monkeypatch):
    task_id = create_task_for_worker(setup)
    video = b"\x00\x00\x00\x18ftypmp42" + b"video-data"

    import app.api.evidence as api

    monkeypatch.setattr(
        api,
        "_probe_video",
        lambda path: {"duration_seconds": 5.0, "streams": []},
    )

    upload = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": ("clip.mp4", video, "video/mp4")},
    )
    assert upload.status_code == 201, upload.text

    async def unexpected_call(*args, **kwargs):
        raise AssertionError("Provider must not be called")

    monkeypatch.setattr(evidence_api, "segment_image", unexpected_call)

    response = setup["client"].post(
        f"/evidence/{upload.json()['id']}/segment",
        headers=auth(setup["manager_token"]),
        json={"prompt": "equipment"},
    )

    assert response.status_code == 422
