import hashlib
import json
import math
import os
import re
import subprocess
import uuid
from pathlib import Path
from typing import Annotated, Any

from fastapi import (
    Body,
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_roles
from app.core.dependencies import get_db
from app.ai.client import MetaAIError
from app.services.evidence_segmentation import segment_image
from app.models import Evidence, User, VerificationRun
from app.models.requirement import Requirement
from app.schemas.evidence import EvidenceResponse
from app.services.audit import record_event
from app.services.evidence_phases import PHASES
from app.services.evidence_integrity import calculate_image_phash
from app.services.tasks import get_task
from app.services.workflow import roll_up_work_order
from app.services.work_orders import get_work_order

router = APIRouter(tags=["Evidence"])
DbSession = Annotated[Session, Depends(get_db)]

CHUNK_SIZE = 64 * 1024
IMAGE_LIMIT = 25 * 1024 * 1024
VIDEO_LIMIT = 100 * 1024 * 1024

ALLOWED_FORMATS = {
    ".jpg": ("image", "image/jpeg"),
    ".jpeg": ("image", "image/jpeg"),
    ".png": ("image", "image/png"),
    ".webp": ("image", "image/webp"),
    ".mp4": ("video", "video/mp4"),
    ".webm": ("video", "video/webm"),
}


def _storage_dir() -> Path:
    return Path(
        os.environ.get("EVIDENCE_STORAGE_DIR", "/var/lib/proofline/evidence")
    ).resolve()


def _valid_signature(extension: str, header: bytes) -> bool:
    if extension in {".jpg", ".jpeg"}:
        return header.startswith(b"\xff\xd8\xff")
    if extension == ".png":
        return header.startswith(b"\x89PNG\r\n\x1a\n")
    if extension == ".webp":
        return (
            len(header) >= 12
            and header[:4] == b"RIFF"
            and header[8:12] == b"WEBP"
        )
    if extension == ".mp4":
        return len(header) >= 12 and header[4:8] == b"ftyp"
    if extension == ".webm":
        return header.startswith(b"\x1a\x45\xdf\xa3")
    return False


def _safe_filename(filename: str | None) -> str:
    name = (filename or "").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()
    name = name[:255]
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return name


def _probe_video(path: Path) -> dict[str, Any]:
    """Validate a video with FFprobe and return compact technical metadata."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries",
                "format=format_name,duration:"
                "stream=codec_type,codec_name,width,height",
                "-of", "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=503, detail="Video inspection service is unavailable"
        ) from None
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=415, detail="Video inspection timed out"
        ) from None

    if result.returncode != 0:
        raise HTTPException(status_code=415, detail="Invalid or unreadable video")

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise HTTPException(status_code=415, detail="Invalid video metadata") from None

    streams = payload.get("streams", [])
    video_streams = [
        stream for stream in streams if stream.get("codec_type") == "video"
    ]
    if not video_streams:
        raise HTTPException(status_code=415, detail="No video stream was found")

    raw_duration = payload.get("format", {}).get("duration")
    duration = None
    if raw_duration is not None:
        try:
            parsed_duration = float(raw_duration)
            if math.isfinite(parsed_duration) and parsed_duration >= 0:
                duration = parsed_duration
        except (TypeError, ValueError):
            pass

    return {
        "format_name": payload.get("format", {}).get("format_name"),
        "duration_seconds": duration,
        "streams": [
            {
                "codec_type": stream.get("codec_type"),
                "codec_name": stream.get("codec_name"),
                "width": stream.get("width"),
                "height": stream.get("height"),
            }
            for stream in streams
        ],
    }


def _authorized_evidence(
    db: Session, evidence_id: uuid.UUID, user: User
) -> Evidence:
    evidence = db.get(Evidence, evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found")

    task = get_task(db, evidence.task_id)
    get_work_order(db, task.work_order_id, user)

    if user.role == "worker" and task.assigned_to is not None:
        if task.assigned_to != user.id:
            raise HTTPException(status_code=404, detail="Evidence not found")

    return evidence


def _verify_integrity(evidence: Evidence, db: Session) -> Path:
    """Hash the stored file and persist the integrity result."""
    storage_dir = _storage_dir()
    path = (storage_dir / evidence.storage_key).resolve()

    # Storage keys must refer to files directly inside the configured directory.
    if path.parent != storage_dir or not evidence.storage_key:
        evidence.integrity_status = "failed"
        db.commit()
        raise HTTPException(status_code=409, detail="Evidence storage key is invalid")

    if not path.is_file():
        evidence.integrity_status = "failed"
        db.commit()
        raise HTTPException(status_code=404, detail="Stored evidence file not found")

    digest = hashlib.sha256()
    try:
        with path.open("rb") as stored_file:
            while True:
                chunk = stored_file.read(CHUNK_SIZE)
                if not chunk:
                    break
                digest.update(chunk)
    except OSError:
        evidence.integrity_status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail="Could not verify evidence") from None

    if not evidence.sha256_hash or digest.hexdigest() != evidence.sha256_hash:
        evidence.integrity_status = "failed"
        db.commit()
        raise HTTPException(status_code=409, detail="Evidence integrity check failed")

    if evidence.integrity_status != "flagged":
        evidence.integrity_status = "passed"
    db.commit()
    return path


@router.post(
    "/tasks/{task_id}/evidence",
    response_model=EvidenceResponse,
    status_code=status.HTTP_201_CREATED,
)
def upload_evidence(
    task_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    file: Annotated[UploadFile, File(...)],
    response: Response,
    requirement_id: Annotated[uuid.UUID | None, Form()] = None,
    phase: Annotated[str, Form()] = "other",
) -> EvidenceResponse:
    if phase not in PHASES:
        raise HTTPException(
            status_code=422, detail="Phase must be before, after or other"
        )
    task = get_task(db, task_id)
    get_work_order(db, task.work_order_id, user)

    requirement = None
    if requirement_id is not None:
        requirement = db.get(Requirement, requirement_id)
        if requirement is None or requirement.task_id != task.id:
            raise HTTPException(status_code=404, detail="Requirement not found")

        existing_count = (
            db.query(Evidence)
            .filter(Evidence.requirement_id == requirement.id)
            .count()
        )
        if existing_count >= requirement.maximum_evidence_count:
            raise HTTPException(
                status_code=409,
                detail="This requirement has reached its maximum evidence count",
            )

    if user.role == "worker" and task.assigned_to is not None:
        if task.assigned_to != user.id:
            raise HTTPException(status_code=404, detail="Task not found")

    original_filename = _safe_filename(file.filename)
    extension = Path(original_filename).suffix.lower()
    format_info = ALLOWED_FORMATS.get(extension)
    if format_info is None:
        raise HTTPException(status_code=415, detail="Unsupported file format")

    media_type, expected_content_type = format_info
    if (file.content_type or "").lower() != expected_content_type:
        raise HTTPException(
            status_code=415,
            detail="File extension and content type do not match",
        )

    limit = IMAGE_LIMIT if media_type == "image" else VIDEO_LIMIT
    storage_dir = _storage_dir()
    storage_key = f"{uuid.uuid4().hex}{extension}"
    destination = storage_dir / storage_key
    created_file = False

    try:
        header = file.file.read(12)
        if not header or not _valid_signature(extension, header):
            raise HTTPException(
                status_code=415,
                detail="File content does not match the supported format",
            )

        storage_dir.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256()
        size_bytes = 0

        with destination.open("xb") as output:
            created_file = True
            size_bytes += len(header)
            if size_bytes > limit:
                raise HTTPException(
                    status_code=413, detail="File exceeds the upload size limit"
                )
            output.write(header)
            digest.update(header)

            while True:
                chunk = file.file.read(CHUNK_SIZE)
                if not chunk:
                    break
                size_bytes += len(chunk)
                if size_bytes > limit:
                    raise HTTPException(
                        status_code=413, detail="File exceeds the upload size limit"
                    )
                output.write(chunk)
                digest.update(chunk)

        # Safe retry: same user, task, hash, filename, and checklist item.
        existing = (
            db.query(Evidence)
            .filter(
                Evidence.task_id == task.id,
                Evidence.sha256_hash == digest.hexdigest(),
                Evidence.submitted_by == user.id,
                Evidence.original_filename == original_filename,
                Evidence.phase == phase,
                Evidence.requirement_id
                == (requirement.id if requirement else None),
            )
            .first()
        )
        if existing is not None:
            destination.unlink(missing_ok=True)
            response.status_code = status.HTTP_200_OK
            return existing

        media_metadata = _probe_video(destination) if media_type == "video" else None

        evidence = Evidence(
            task_id=task.id,
            requirement_id=requirement.id if requirement else None,
            submitted_by=user.id,
            media_type=media_type,
            storage_key=storage_key,
            original_filename=original_filename,
            content_type=expected_content_type,
            media_metadata=media_metadata,
            phase=phase,
            size_bytes=size_bytes,
            sha256_hash=digest.hexdigest(),
            perceptual_hash=(
                calculate_image_phash(destination)
                if media_type == "image"
                else None
            ),
            integrity_status="pending",
        )

        db.add(evidence)
        db.flush()
        record_event(
            db,
            user.id,
            "evidence",
            evidence.id,
            "evidence.uploaded",
            {
                "task_id": str(task.id),
                "media_type": media_type,
                "sha256": evidence.sha256_hash,
                "size_bytes": size_bytes,
                "phase": phase,
            },
        )
        if task.status == "pending" and user.role == "worker":
            task.status = "in_progress"
            record_event(
                db,
                user.id,
                "task",
                task.id,
                "task.started",
                {"from": "pending", "to": "in_progress"},
            )
            roll_up_work_order(db, task.work_order, user.id)
        db.commit()
        db.refresh(evidence)
        return evidence

    except HTTPException:
        db.rollback()
        if created_file:
            destination.unlink(missing_ok=True)
        raise
    except Exception:
        db.rollback()
        if created_file:
            destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500, detail="Could not save evidence"
        ) from None
    finally:
        file.file.close()


@router.delete("/evidence/{evidence_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_evidence(
    evidence_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
) -> Response:
    """Remove a wrong upload so a new one can be added.

    Workers can remove only their own files. Managers can remove any file.
    Submitted tasks are withdrawn when their evidence changes.
    """
    evidence = _authorized_evidence(db, evidence_id, user)
    task = get_task(db, evidence.task_id)

    if user.role == "worker" and evidence.submitted_by != user.id:
        raise HTTPException(status_code=403, detail="You can only remove your own files")
    if task.status == "approved":
        raise HTTPException(
            status_code=409,
            detail="This task is approved, so its files can no longer be changed",
        )

    storage_dir = _storage_dir()
    path = (storage_dir / evidence.storage_key).resolve() if evidence.storage_key else None
    record_event(
        db,
        user.id,
        "evidence",
        evidence.id,
        "evidence.deleted",
        {
            "task_id": str(task.id),
            "filename": evidence.original_filename,
            "sha256": evidence.sha256_hash,
            "phase": evidence.phase,
        },
    )
    for run in list(db.scalars(select(VerificationRun).where(VerificationRun.evidence_id == evidence.id))):
        db.delete(run)
    db.delete(evidence)
    if task.status == "submitted":
        task.status = "in_progress"
        record_event(
            db,
            user.id,
            "task",
            task.id,
            "task.withdrawn",
            {"from": "submitted", "to": "in_progress", "reason": "evidence changed"},
        )
        roll_up_work_order(db, task.work_order, user.id)
    db.commit()

    if path is not None and path.parent == storage_dir:
        path.unlink(missing_ok=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/evidence/{evidence_id}", response_model=EvidenceResponse)
def get_evidence(
    evidence_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
) -> EvidenceResponse:
    return _authorized_evidence(db, evidence_id, user)


@router.get("/evidence/{evidence_id}/content")
def download_evidence(
    evidence_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
) -> FileResponse:
    evidence = _authorized_evidence(db, evidence_id, user)
    path = _verify_integrity(evidence, db)

    return FileResponse(
        path=path,
        media_type=evidence.content_type,
        filename=evidence.original_filename,
    )


@router.post("/evidence/{evidence_id}/segment")
async def segment_evidence_image(
    evidence_id: uuid.UUID,
    prompt: Annotated[str, Body(embed=True, min_length=1, max_length=200)],
    db: DbSession,
    user: Annotated[User, Depends(require_roles("manager"))],
) -> dict[str, Any]:
    """Run visual segmentation on authorized, integrity-checked image evidence."""
    evidence = _authorized_evidence(db, evidence_id, user)

    if evidence.media_type != "image":
        raise HTTPException(
            status_code=422,
            detail="Image segmentation requires image evidence",
        )

    if not isinstance(prompt, str) or not prompt.strip():
        raise HTTPException(
            status_code=422,
            detail="Provide a short object description",
        )

    path = _verify_integrity(evidence, db)

    try:
        image_bytes = path.read_bytes()
    except OSError:
        raise HTTPException(
            status_code=500,
            detail="Could not read evidence image",
        ) from None

    try:
        result = await segment_image(
            image_bytes,
            content_type=evidence.content_type,
            prompt=prompt,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except MetaAIError:
        raise HTTPException(
            status_code=502,
            detail="Image segmentation provider request failed",
        ) from None
    except RuntimeError:
        raise HTTPException(
            status_code=503,
            detail="Image segmentation service is not configured",
        ) from None

    return {
        "evidence_id": str(evidence.id),
        "integrity_status": evidence.integrity_status,
        **result,
    }
