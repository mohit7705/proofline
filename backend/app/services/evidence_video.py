"""Authorized video-evidence access and frame extraction."""

import hashlib
import os
from pathlib import Path
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Evidence, User
from app.services.tasks import get_task
from app.services.video_frames import (
    ExtractedFrame,
    VideoFrameExtractionError,
    extract_video_frames,
)
from app.services.work_orders import get_work_order


class EvidenceVideoError(Exception):
    """Controlled error while preparing authorized video evidence."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


def extract_authorized_evidence_frames(
    db: Session,
    evidence_id: UUID,
    user: User,
    timestamps_seconds: list[float],
) -> list[ExtractedFrame]:
    """Authorize, integrity-check, and extract frames from video evidence.

    This function is intended for trusted backend workers/services.
    It never accepts a filesystem path from the caller.
    """
    evidence = db.get(Evidence, evidence_id)
    if evidence is None:
        raise EvidenceVideoError("not_found", "Evidence not found.")

    task = get_task(db, evidence.task_id)
    get_work_order(db, task.work_order_id, user)

    if (
        user.role == "worker"
        and task.assigned_to is not None
        and task.assigned_to != user.id
    ):
        raise EvidenceVideoError("not_found", "Evidence not found.")

    if evidence.media_type != "video":
        raise EvidenceVideoError(
            "not_video", "Frame extraction requires video evidence."
        )

    metadata = evidence.media_metadata
    if not isinstance(metadata, dict):
        raise EvidenceVideoError(
            "invalid_metadata", "Video metadata is unavailable."
        )

    duration = metadata.get("duration_seconds")
    if (
        isinstance(duration, bool)
        or not isinstance(duration, (int, float))
    ):
        raise EvidenceVideoError(
            "invalid_metadata", "Video duration is unavailable."
        )

    storage_dir = Path(
        os.environ.get("EVIDENCE_STORAGE_DIR", "/var/lib/proofline/evidence")
    ).resolve()

    if not evidence.storage_key:
        raise EvidenceVideoError(
            "invalid_storage_key", "Evidence storage key is invalid."
        )

    path = (storage_dir / evidence.storage_key).resolve()
    if path.parent != storage_dir or not path.is_file():
        raise EvidenceVideoError(
            "file_unavailable", "Stored evidence file is unavailable."
        )

    digest = hashlib.sha256()
    try:
        with path.open("rb") as stored_file:
            for chunk in iter(lambda: stored_file.read(64 * 1024), b""):
                digest.update(chunk)
    except OSError:
        raise EvidenceVideoError(
            "integrity_check_failed", "Could not verify evidence integrity."
        ) from None

    if not evidence.sha256_hash or digest.hexdigest() != evidence.sha256_hash:
        evidence.integrity_status = "failed"
        db.commit()
        raise EvidenceVideoError(
            "integrity_check_failed", "Evidence integrity verification failed."
        )

    evidence.integrity_status = "passed"
    db.commit()

    try:
        return extract_video_frames(
            video_path=path,
            timestamps_seconds=timestamps_seconds,
            video_duration_seconds=float(duration),
        )
    except VideoFrameExtractionError as exc:
        raise EvidenceVideoError(exc.code, str(exc)) from exc
