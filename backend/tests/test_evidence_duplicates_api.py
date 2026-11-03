from io import BytesIO
from uuid import UUID

from PIL import Image, ImageDraw

from app.models.evidence import Evidence
from conftest import auth, create_task_for_worker


def make_image(*, variant: int = 0, image_format: str = "PNG") -> bytes:
    """Generate a real image rather than a file with only a PNG signature."""
    image = Image.new("RGB", (256, 256), (235, 235, 235))
    draw = ImageDraw.Draw(image)

    draw.rectangle((35, 35, 220, 220), fill=(40, 100, 170))
    draw.ellipse(
        (65 + variant, 65, 145 + variant, 145),
        fill=(240, 180, 40),
    )
    draw.line((25, 220, 230, 30), fill=(190, 45, 45), width=5)

    output = BytesIO()
    image.save(output, format=image_format)
    return output.getvalue()


def upload_image(setup, task_id: str, content: bytes, filename: str):
    response = setup["client"].post(
        f"/tasks/{task_id}/evidence",
        headers=auth(setup["worker_token"]),
        files={"file": (filename, content, "image/png")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_duplicate_endpoint_finds_exact_sha256_match(setup):
    task_id = create_task_for_worker(setup)
    image_bytes = make_image()

    first = upload_image(setup, task_id, image_bytes, "first.png")
    second = upload_image(setup, task_id, image_bytes, "second.png")

    response = setup["client"].get(
        f"/evidence/{second['id']}/duplicates",
        headers=auth(setup["manager_token"]),
    )

    assert response.status_code == 200, response.text
    matches = response.json()

    assert len(matches) == 1
    assert matches[0]["evidence_id"] == first["id"]
    assert matches[0]["match_type"] == "exact_sha256"
    assert matches[0]["distance"] is None
    assert matches[0]["task_id"] == task_id
    assert matches[0]["filename"] == "first.png"


def test_duplicate_endpoint_finds_perceptually_similar_image(setup):
    task_id = create_task_for_worker(setup)

    original = upload_image(
        setup, task_id, make_image(), "original.png"
    )
    similar = upload_image(
        setup, task_id, make_image(variant=1), "similar.png"
    )

    # Confirm these uploads are not byte-for-byte identical.
    assert original["sha256_hash"] != similar["sha256_hash"]

    response = setup["client"].get(
        f"/evidence/{similar['id']}/duplicates",
        headers=auth(setup["manager_token"]),
    )

    assert response.status_code == 200, response.text
    matches = response.json()

    perceptual_matches = [
        match
        for match in matches
        if match["match_type"] == "perceptual_hash"
    ]

    assert any(
        match["evidence_id"] == original["id"]
        and match["distance"] is not None
        and match["distance"] <= 8
        for match in perceptual_matches
    )


def test_duplicate_endpoint_returns_404_for_missing_evidence(setup):
    missing_id = "00000000-0000-0000-0000-000000000001"

    response = setup["client"].get(
        f"/evidence/{missing_id}/duplicates",
        headers=auth(setup["manager_token"]),
    )

    assert response.status_code == 404


def test_worker_cannot_access_analyst_duplicate_endpoint(setup):
    task_id = create_task_for_worker(setup)
    uploaded = upload_image(
        setup, task_id, make_image(), "worker-upload.png"
    )

    response = setup["client"].get(
        f"/evidence/{uploaded['id']}/duplicates",
        headers=auth(setup["worker_token"]),
    )

    assert response.status_code == 403


def test_duplicate_endpoint_rejects_video_evidence(setup):
    task_id = create_task_for_worker(setup)

    # Create a video evidence record directly so this test doesn't depend
    # on a real video upload or FFmpeg.
    with setup["session_factory"]() as db:
        video = Evidence(
            task_id=UUID(str(task_id)),
            submitted_by=UUID(str(setup["worker_id"])),
            media_type="video",
            storage_key="test-video.mp4",
            original_filename="test-video.mp4",
            content_type="video/mp4",
            size_bytes=128,
            sha256_hash="a" * 64,
            integrity_status="pending",
        )
        db.add(video)
        db.commit()
        db.refresh(video)
        video_id = video.id

    response = setup["client"].get(
        f"/evidence/{video_id}/duplicates",
        headers=auth(setup["manager_token"]),
    )

    assert response.status_code == 422
    assert "image evidence only" in response.json()["detail"]
