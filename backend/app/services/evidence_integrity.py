
"""Evidence integrity and duplicate signals.

Exact SHA-256 matches and perceptual image matches are review signals,
not independent determinations of fraud.
"""

from __future__ import annotations

from pathlib import Path

import imagehash
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Evidence, Task


MAX_IMAGE_PIXELS = 40_000_000
MAX_CANDIDATES = 500


def calculate_image_phash(path: Path) -> str | None:
    """Calculate a 64-bit perceptual hash for a supported image.

    Returns None when the image cannot safely be decoded. This fingerprint
    supplements, but never replaces, the original file's SHA-256 hash.
    """
    try:
        with Image.open(path) as image:
            width, height = image.size

            if width <= 0 or height <= 0:
                return None

            if width * height > MAX_IMAGE_PIXELS:
                return None

            image.load()
            normalized = ImageOps.exif_transpose(image).convert("RGB")
            return str(imagehash.phash(normalized))

    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
    ):
        return None


def find_exact_duplicates(
    db: Session,
    evidence: Evidence,
) -> list[Evidence]:
    """Find byte-identical evidence in the same work order."""
    if not evidence.sha256_hash:
        return []

    task = db.get(Task, evidence.task_id)
    if task is None:
        return []

    stmt = (
        select(Evidence)
        .join(Task, Evidence.task_id == Task.id)
        .where(
            Task.work_order_id == task.work_order_id,
            Evidence.sha256_hash == evidence.sha256_hash,
            Evidence.id != evidence.id,
        )
        .order_by(Evidence.uploaded_at.desc())
        .limit(20)
    )
    return list(db.scalars(stmt).all())


def perceptual_hash_distance(left: str, right: str) -> int | None:
    """Return the Hamming distance between two 64-bit perceptual hashes."""
    if len(left) != 16 or len(right) != 16:
        return None

    try:
        left_hash = imagehash.hex_to_hash(left)
        right_hash = imagehash.hex_to_hash(right)
    except (TypeError, ValueError):
        return None

    if len(left_hash.hash.flatten()) != 64:
        return None

    return left_hash - right_hash


def find_perceptual_duplicates(
    db: Session,
    evidence: Evidence,
    *,
    max_distance: int = 8,
) -> list[tuple[Evidence, int]]:
    """Find potentially similar image evidence in the same work order.

    Results are ordered by perceptual distance, with smaller distances
    indicating greater similarity. This is a candidate generator, not a
    final fraud decision.
    """
    if (
        evidence.media_type != "image"
        or not evidence.perceptual_hash
        or not 0 <= max_distance <= 64
    ):
        return []

    task = db.get(Task, evidence.task_id)
    if task is None:
        return []

    stmt = (
        select(Evidence)
        .join(Task, Evidence.task_id == Task.id)
        .where(
            Task.work_order_id == task.work_order_id,
            Evidence.media_type == "image",
            Evidence.perceptual_hash.is_not(None),
            Evidence.id != evidence.id,
        )
        .order_by(Evidence.uploaded_at.desc())
        .limit(MAX_CANDIDATES)
    )

    matches: list[tuple[Evidence, int]] = []

    for candidate in db.scalars(stmt):
        if not candidate.perceptual_hash:
            continue

        distance = perceptual_hash_distance(
            evidence.perceptual_hash,
            candidate.perceptual_hash,
        )

        if distance is not None and distance <= max_distance:
            matches.append((candidate, distance))

    return sorted(matches, key=lambda match: match[1])[:20]
