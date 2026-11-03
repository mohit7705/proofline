from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from PIL import Image

from app.services.evidence_integrity import (
    calculate_image_phash,
    find_exact_duplicates,
    find_perceptual_duplicates,
    perceptual_hash_distance,
)


def test_duplicate_check_skips_evidence_without_hash():
    db = MagicMock()
    evidence = SimpleNamespace(
        sha256_hash=None,
        task_id="task-id",
    )

    assert find_exact_duplicates(db, evidence) == []
    db.get.assert_not_called()


def test_calculate_image_phash_for_valid_image(tmp_path: Path):
    image_path = tmp_path / "sample.png"
    Image.new("RGB", (128, 128), "white").save(image_path)

    result = calculate_image_phash(image_path)

    assert result is not None
    assert len(result) == 16
    assert all(char in "0123456789abcdef" for char in result)


def test_calculate_image_phash_returns_none_for_invalid_file(
    tmp_path: Path,
):
    image_path = tmp_path / "invalid.png"
    image_path.write_bytes(b"not an image")

    assert calculate_image_phash(image_path) is None


def test_identical_images_have_zero_perceptual_distance(
    tmp_path: Path,
):
    image_path = tmp_path / "sample.png"
    Image.new("RGB", (128, 128), "white").save(image_path)

    fingerprint = calculate_image_phash(image_path)

    assert fingerprint is not None
    assert perceptual_hash_distance(fingerprint, fingerprint) == 0


def test_invalid_perceptual_hashes_are_rejected():
    assert perceptual_hash_distance("invalid", "0000000000000000") is None
    assert perceptual_hash_distance("0000000000000000", "invalid") is None


def test_perceptual_matching_skips_video_evidence():
    db = MagicMock()
    evidence = SimpleNamespace(
        media_type="video",
        perceptual_hash="0000000000000000",
        task_id="task-id",
    )

    assert find_perceptual_duplicates(db, evidence) == []
    db.get.assert_not_called()


def test_perceptual_matching_skips_missing_hash():
    db = MagicMock()
    evidence = SimpleNamespace(
        media_type="image",
        perceptual_hash=None,
        task_id="task-id",
    )

    assert find_perceptual_duplicates(db, evidence) == []
    db.get.assert_not_called()


def test_perceptual_matching_rejects_invalid_threshold():
    db = MagicMock()
    evidence = SimpleNamespace(
        media_type="image",
        perceptual_hash="0000000000000000",
        task_id="task-id",
    )

    assert find_perceptual_duplicates(
        db, evidence, max_distance=65
    ) == []
    db.get.assert_not_called()

def test_resized_recompressed_image_has_similar_phash(tmp_path: Path):
    """A resized JPEG copy should retain a similar perceptual fingerprint."""
    original = Image.new("RGB", (256, 256), "white")

    # Use a high-contrast pattern rather than a uniform image.
    from PIL import ImageDraw

    draw = ImageDraw.Draw(original)
    draw.rectangle((20, 20, 110, 110), fill="black")
    draw.ellipse((130, 100, 230, 220), fill="black")
    draw.line((0, 255, 255, 0), fill="gray", width=8)

    original_path = tmp_path / "original.png"
    copy_path = tmp_path / "resized_copy.jpg"

    original.save(original_path)
    original.resize((128, 128)).save(
        copy_path, format="JPEG", quality=75
    )

    original_hash = calculate_image_phash(original_path)
    copy_hash = calculate_image_phash(copy_path)

    assert original_hash is not None
    assert copy_hash is not None

    distance = perceptual_hash_distance(original_hash, copy_hash)
    assert distance is not None
    assert distance <= 8


def test_unrelated_images_have_different_phashes(tmp_path: Path):
    """Clearly different visual patterns should not be near-identical."""
    first = Image.new("RGB", (128, 128), "white")
    second = Image.new("RGB", (128, 128), "black")

    from PIL import ImageDraw

    draw = ImageDraw.Draw(first)
    draw.rectangle((0, 0, 63, 127), fill="black")

    draw = ImageDraw.Draw(second)
    draw.ellipse((16, 16, 112, 112), fill="white")

    first_path = tmp_path / "first.png"
    second_path = tmp_path / "second.png"
    first.save(first_path)
    second.save(second_path)

    first_hash = calculate_image_phash(first_path)
    second_hash = calculate_image_phash(second_path)

    assert first_hash is not None
    assert second_hash is not None

    distance = perceptual_hash_distance(first_hash, second_hash)
    assert distance is not None
    assert distance > 8


def test_database_exact_duplicate_is_limited_to_same_work_order():
    import uuid

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app.models import Base, Evidence, Task, User, WorkOrder

    engine = create_engine("sqlite+pysqlite://")
    Base.metadata.create_all(engine)

    try:
        with Session(engine) as db:
            user = User(
                email="integrity-manager@example.com",
                password_hash="test-hash",
                full_name="Integrity Manager",
                role="manager",
                is_active=True,
            )
            db.add(user)
            db.flush()

            order_a = WorkOrder(
                title="Order A",
                description="Test order A",
                created_by=user.id,
            )
            order_b = WorkOrder(
                title="Order B",
                description="Test order B",
                created_by=user.id,
            )
            db.add_all([order_a, order_b])
            db.flush()

            task_a = Task(
                work_order_id=order_a.id,
                title="Task A",
                instructions="Inspect item",
            )
            task_a2 = Task(
                work_order_id=order_a.id,
                title="Task A2",
                instructions="Inspect another item",
            )
            task_b = Task(
                work_order_id=order_b.id,
                title="Task B",
                instructions="Inspect separate item",
            )
            db.add_all([task_a, task_a2, task_b])
            db.flush()

            source = Evidence(
                task_id=task_a.id,
                submitted_by=user.id,
                media_type="image",
                storage_key="source.png",
                original_filename="source.png",
                content_type="image/png",
                size_bytes=100,
                sha256_hash="a" * 64,
                perceptual_hash="0123456789abcdef",
            )
            same_order = Evidence(
                task_id=task_a2.id,
                submitted_by=user.id,
                media_type="image",
                storage_key="same-order.png",
                original_filename="same-order.png",
                content_type="image/png",
                size_bytes=100,
                sha256_hash="a" * 64,
                perceptual_hash="0123456789abcdef",
            )
            other_order = Evidence(
                task_id=task_b.id,
                submitted_by=user.id,
                media_type="image",
                storage_key="other-order.png",
                original_filename="other-order.png",
                content_type="image/png",
                size_bytes=100,
                sha256_hash="a" * 64,
                perceptual_hash="0123456789abcdef",
            )

            db.add_all([source, same_order, other_order])
            db.flush()

            matches = find_exact_duplicates(db, source)

            assert [item.id for item in matches] == [same_order.id]
            assert other_order.id not in {item.id for item in matches}

    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_database_perceptual_duplicates_are_limited_to_same_work_order():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app.models import Base, Evidence, Task, User, WorkOrder

    engine = create_engine("sqlite+pysqlite://")
    Base.metadata.create_all(engine)

    try:
        with Session(engine) as db:
            user = User(
                email="perceptual-manager@example.com",
                password_hash="test-hash",
                full_name="Perceptual Manager",
                role="manager",
                is_active=True,
            )
            db.add(user)
            db.flush()

            order_a = WorkOrder(
                title="Image Order A",
                description="Perceptual test order A",
                created_by=user.id,
            )
            order_b = WorkOrder(
                title="Image Order B",
                description="Perceptual test order B",
                created_by=user.id,
            )
            db.add_all([order_a, order_b])
            db.flush()

            task_a = Task(
                work_order_id=order_a.id,
                title="Image Task A",
                instructions="Compare images",
            )
            task_a2 = Task(
                work_order_id=order_a.id,
                title="Image Task A2",
                instructions="Compare another image",
            )
            task_b = Task(
                work_order_id=order_b.id,
                title="Image Task B",
                instructions="Separate order",
            )
            db.add_all([task_a, task_a2, task_b])
            db.flush()

            source = Evidence(
                task_id=task_a.id,
                submitted_by=user.id,
                media_type="image",
                storage_key="phash-source.png",
                original_filename="phash-source.png",
                content_type="image/png",
                size_bytes=100,
                sha256_hash="b" * 64,
                perceptual_hash="0000000000000000",
            )
            near_match = Evidence(
                task_id=task_a2.id,
                submitted_by=user.id,
                media_type="image",
                storage_key="phash-near.png",
                original_filename="phash-near.png",
                content_type="image/png",
                size_bytes=100,
                sha256_hash="c" * 64,
                perceptual_hash="0000000000000001",
            )
            other_order = Evidence(
                task_id=task_b.id,
                submitted_by=user.id,
                media_type="image",
                storage_key="phash-other.png",
                original_filename="phash-other.png",
                content_type="image/png",
                size_bytes=100,
                sha256_hash="d" * 64,
                perceptual_hash="0000000000000001",
            )

            db.add_all([source, near_match, other_order])
            db.flush()

            matches = find_perceptual_duplicates(
                db, source, max_distance=8
            )

            assert [(item.id, distance) for item, distance in matches] == [
                (near_match.id, 1)
            ]
            assert other_order.id not in {item.id for item, _ in matches}

    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
