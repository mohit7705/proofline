"""End-to-end orchestration for authorized video evidence verification."""

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.ai.client import MetaAIClient
from app.models import Evidence, Requirement, User, VerificationRun
from app.schemas.video_analysis import VideoAnalysisRequest, VideoAnalysisResult
from app.services.evidence_video import (
    EvidenceVideoError,
    extract_authorized_evidence_frames,
)
from app.services.tasks import get_task
from app.services.video_analysis import (
    VIDEO_ANALYSIS_MODEL,
    analyze_video_frames,
)
from app.services.work_orders import get_work_order

SamplingStrategy = Literal["uniform", "adaptive", "manual"]


def _failure_code(code: str) -> str:
    """Map internal evidence errors to the public analysis error vocabulary."""
    if code in {"integrity_check_failed", "integrity_failed"}:
        return "integrity_failed"
    if code in {
        "video_decode_failed",
        "ffmpeg_unavailable",
        "extraction_timeout",
        "frame_extraction_failed",
        "invalid_timestamps",
        "invalid_duration",
    }:
        return "video_decode_failed"
    return "analysis_failed"


def _failed_result(code: str) -> VideoAnalysisResult:
    return VideoAnalysisResult(status="failed", error_code=code)


async def verify_video_evidence(
    db: Session,
    evidence_id: UUID,
    user: User,
    timestamps_seconds: list[float],
    sampling_strategy: SamplingStrategy = "manual",
    client: MetaAIClient | None = None,
) -> VerificationRun:
    """Authorize, analyze, and persist a video verification attempt.

    Access failures are rejected before a VerificationRun is created.
    Analysis and evidence-processing failures are persisted as failed runs.
    """
    evidence = db.get(Evidence, evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found")

    task = get_task(db, evidence.task_id)
    get_work_order(db, task.work_order_id, user)

    if (
        user.role == "worker"
        and task.assigned_to is not None
        and task.assigned_to != user.id
    ):
        raise HTTPException(status_code=404, detail="Evidence not found")

    requirement = None
    if evidence.requirement_id is not None:
        requirement = db.get(Requirement, evidence.requirement_id)
        if requirement is None or requirement.task_id != task.id:
            raise HTTPException(status_code=404, detail="Requirement not found")

    run = VerificationRun(
        evidence_id=evidence.id,
        model_name=VIDEO_ANALYSIS_MODEL,
        model_version=VIDEO_ANALYSIS_MODEL,
        status="processing",
        findings={},
        started_at=datetime.now(UTC),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    unexpected_error: Exception | None = None

    try:
        frames = extract_authorized_evidence_frames(
            db=db,
            evidence_id=evidence.id,
            user=user,
            timestamps_seconds=timestamps_seconds,
        )
        metadata = evidence.media_metadata
        duration = (
            float(metadata["duration_seconds"])
            if isinstance(metadata, dict)
            and isinstance(metadata.get("duration_seconds"), (int, float))
            and not isinstance(metadata.get("duration_seconds"), bool)
            else 0.0
        )

        request = VideoAnalysisRequest(
            evidence_id=evidence.id,
            task_id=task.id,
            requirement_id=evidence.requirement_id,
            task_instructions=task.instructions or task.title or "Verify submitted video evidence.",
            requirement_instructions=(
                requirement.instructions if requirement is not None else None
            ),
            required_viewpoints=(
                requirement.required_viewpoints
                if requirement is not None
                and isinstance(requirement.required_viewpoints, list)
                else []
            ),
        )
        result = await analyze_video_frames(
            request=request,
            frames=frames,
            video_duration_seconds=duration,
            sampling_strategy=sampling_strategy,
            client=client,
        )
    except EvidenceVideoError as exc:
        result = _failed_result(_failure_code(exc.code))
    except (RuntimeError, ValueError):
        result = _failed_result("analysis_failed")
    except Exception as exc:  # noqa: BLE001
        # Persist a controlled failure, then re-raise unexpected defects.
        unexpected_error = exc
        result = _failed_result("analysis_failed")

    run.findings = result.model_dump(mode="json")
    run.confidence = result.confidence
    run.status = result.status
    run.completed_at = datetime.now(UTC)
    db.commit()
    db.refresh(run)
    if unexpected_error is not None:
        raise unexpected_error.with_traceback(unexpected_error.__traceback__)
    return run
