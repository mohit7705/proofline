"""Voice notes and background video analysis."""

import logging
import math
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.client import MetaAIError, MetaAIResponseError
from app.api.auth import CurrentUser, require_roles
from app.core.dependencies import SessionLocal, get_db
from app.models import Evidence, User, VerificationRun
from app.schemas.video_analysis_api import AnalyzeEvidenceRequest
from app.services.analysis_access import ensure_can_analyze
from app.services.audit import record_event
from app.services.speech_transcription import (
    ALLOWED_SUFFIXES as ALLOWED_AUDIO_SUFFIXES,
    MAX_AUDIO_BYTES,
    UnsupportedAudioError,
    transcribe_audio_file,
)
from app.services.tasks import get_task
from app.services.video_verification import verify_video_evidence
from app.services.work_orders import get_work_order
from app.services.workflow import get_task_for_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["AI jobs"])
DbSession = Annotated[Session, Depends(get_db)]
# A worker may analyse the files they uploaded themselves.
Analyst = Annotated[
    User, Depends(require_roles("manager", "worker"))
]

# A run that has been "processing" longer than this is treated as dead.
STUCK_AFTER = timedelta(minutes=10)


def get_session_factory():
    """Session factory for background jobs (replaced in tests)."""
    return SessionLocal


@router.post("/tasks/{task_id}/transcribe")
async def transcribe_voice_note(
    task_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    file: Annotated[UploadFile, File(...)],
) -> dict[str, Any]:
    """Turn a short voice note into text.

    The transcript is a worker's claim, not proof of work. It is returned
    and written to the audit trail (text only). The audio is not kept.
    """
    task = get_task_for_user(db, task_id, user)

    audio = await file.read(MAX_AUDIO_BYTES + 1)
    if not audio or len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio is empty or larger than 32 MB")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        suffix = ".wav" if audio[:4] == b"RIFF" else ".mp3"
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / f"voice-note{suffix}"
        path.write_bytes(audio)
        try:
            result = await transcribe_audio_file(path)
        except UnsupportedAudioError as exc:
            raise HTTPException(status_code=415, detail=str(exc)) from None
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from None
        except MetaAIResponseError as exc:
            if "No transcript" in str(exc):
                raise HTTPException(
                    status_code=422,
                    detail="No speech was heard. Try again closer to the microphone.",
                ) from None
            raise HTTPException(
                status_code=502, detail="Transcription provider request failed"
            ) from None
        except MetaAIError:
            raise HTTPException(
                status_code=502, detail="Transcription provider request failed"
            ) from None
        except RuntimeError:
            raise HTTPException(
                status_code=503, detail="Transcription service is not configured"
            ) from None

    record_event(
        db,
        user.id,
        "task",
        task.id,
        "audio.transcribed",
        {"transcript": str(result.get("transcript", ""))[:2000], "model": result.get("model")},
    )
    db.commit()
    return {"task_id": str(task.id), **result}


def _default_timestamps(duration: float) -> list[float]:
    count = min(12, max(2, int(duration // 5) + 1))
    end = max(0.0, float(duration) - 0.1)
    return sorted({round(end * i / (count - 1), 3) for i in range(count)})


async def _run_analysis_job(
    evidence_id: uuid.UUID,
    user_id: uuid.UUID,
    timestamps: list[float],
    strategy: str,
) -> None:
    """Runs after the response was sent, with its own database session."""
    with get_session_factory()() as db:
        user = db.get(User, user_id)
        if user is None:
            return
        try:
            await verify_video_evidence(
                db=db,
                evidence_id=evidence_id,
                user=user,
                timestamps_seconds=timestamps,
                sampling_strategy=strategy,  # type: ignore[arg-type]
            )
        except Exception:  # the failure is also saved on the run itself
            logger.exception("Background analysis failed for %s", evidence_id)


@router.post(
    "/evidence/{evidence_id}/analyze/background",
    status_code=status.HTTP_202_ACCEPTED,
)
async def analyze_in_background(
    evidence_id: uuid.UUID,
    payload: AnalyzeEvidenceRequest,
    background: BackgroundTasks,
    db: DbSession,
    user: Analyst,
) -> dict[str, str]:
    """Start the video analysis and answer at once. Poll GET /evidence/{id}/analysis."""
    evidence = db.get(Evidence, evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found")
    if evidence.media_type != "video":
        raise HTTPException(status_code=422, detail="AI frame analysis currently requires video evidence")
    task = get_task(db, evidence.task_id)
    get_work_order(db, task.work_order_id, user)
    ensure_can_analyze(db, evidence, user)

    metadata = evidence.media_metadata if isinstance(evidence.media_metadata, dict) else {}
    duration = metadata.get("duration_seconds")
    if (
        isinstance(duration, bool)
        or not isinstance(duration, (int, float))
        or not math.isfinite(duration)
        or duration <= 0
    ):
        raise HTTPException(status_code=422, detail="Video duration metadata is unavailable")

    timestamps = (
        _default_timestamps(duration)
        if payload.timestamps_seconds is None
        else payload.timestamps_seconds
    )
    if (
        not timestamps
        or
        len(timestamps) > 100
        or any(t < 0 or t > duration for t in timestamps)
        or timestamps != sorted(set(timestamps))
    ):
        raise HTTPException(status_code=422, detail="Frame timestamps must be unique, ascending and within the video")

    running = db.scalar(
        select(VerificationRun)
        .where(
            VerificationRun.evidence_id == evidence.id,
            VerificationRun.status == "processing",
        )
        .order_by(VerificationRun.started_at.desc())
        .limit(1)
    )
    if running is not None and running.started_at is not None:
        started = running.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - started < STUCK_AFTER:
            raise HTTPException(status_code=409, detail="An analysis is already running for this video")

    background.add_task(
        _run_analysis_job, evidence.id, user.id, list(timestamps), payload.sampling_strategy
    )
    return {"status": "queued", "evidence_id": str(evidence.id)}
