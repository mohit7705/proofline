"""Authorized API endpoints for Step 6 video analysis."""
from datetime import UTC, datetime
import math
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_roles
from app.core.dependencies import get_db
from app.models import Evidence, VerificationRun, User
from app.schemas.video_analysis_api import (
    AnalyzeEvidenceRequest,
    AnalysisRunResponse,
    DuplicateMatch,
)
from app.services.analysis_access import ensure_can_analyze
from app.services.evidence_integrity import (
    find_exact_duplicates,
    find_perceptual_duplicates,
)
from app.services.tasks import get_task
from app.services.video_verification import verify_video_evidence
from app.services.work_orders import get_work_order

router = APIRouter(tags=["AI evidence analysis"])
DbSession = Annotated[Session, Depends(get_db)]
Analyst = Annotated[User, Depends(require_roles("manager"))]
# A worker may also analyse the files they uploaded themselves.
AnalysisUser = Annotated[
    User, Depends(require_roles("manager", "worker"))
]
# A worker may also analyse the files they uploaded themselves.


def _run_response(
    db: Session,
    run: VerificationRun,
) -> AnalysisRunResponse:
    evidence = db.get(Evidence, run.evidence_id)
    duplicate_matches = (
        _duplicate_matches_for_evidence(db, evidence)
        if evidence is not None
        else []
    )
    return AnalysisRunResponse(
        id=run.id, evidence_id=run.evidence_id, model_name=run.model_name,
        model_version=run.model_version, status=run.status, findings=run.findings or {},
        confidence=run.confidence,
        duplicate_matches=duplicate_matches,
        started_at=run.started_at, completed_at=run.completed_at,
    )


def _duplicate_matches_for_evidence(
    db: Session,
    evidence: Evidence,
) -> list[DuplicateMatch]:
    exact_matches = find_exact_duplicates(db, evidence)
    exact_ids = {item.id for item in exact_matches}
    matches = [
        DuplicateMatch(
            evidence_id=item.id,
            task_id=item.task_id,
            filename=item.original_filename,
            uploaded_at=item.uploaded_at,
            match_type="exact_sha256",
            distance=None,
        )
        for item in exact_matches
    ]
    if evidence.media_type == "image":
        for item, distance in find_perceptual_duplicates(db, evidence):
            # Avoid reporting an exact duplicate twice.
            if item.id in exact_ids:
                continue
            matches.append(
                DuplicateMatch(
                    evidence_id=item.id,
                    task_id=item.task_id,
                    filename=item.original_filename,
                    uploaded_at=item.uploaded_at,
                    match_type="perceptual_hash",
                    distance=distance,
                )
            )
    return matches


@router.get(
    "/evidence/{evidence_id}/duplicates",
    response_model=list[DuplicateMatch],
)
def check_evidence_duplicates(
    evidence_id: UUID,
    db: DbSession,
    user: Analyst,
) -> list[DuplicateMatch]:
    """Check image evidence for exact and perceptual duplicate signals."""
    evidence = db.get(Evidence, evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found")
    if evidence.media_type != "image":
        raise HTTPException(
            status_code=422,
            detail="Duplicate checking currently supports image evidence only",
        )
    task = get_task(db, evidence.task_id)
    get_work_order(db, task.work_order_id, user)
    return _duplicate_matches_for_evidence(db, evidence)


@router.post("/evidence/{evidence_id}/analyze", response_model=AnalysisRunResponse)
async def analyze_evidence(
    evidence_id: UUID, payload: AnalyzeEvidenceRequest, db: DbSession, user: AnalysisUser,
) -> AnalysisRunResponse:
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
    if payload.timestamps_seconds is None:
        # Bounded sampling: at most 12 frames, including start and near-end.
        count = min(12, max(2, int(duration // 5) + 1))
        end = max(0.0, float(duration) - 0.1)
        timestamps = sorted({round(end * i / (count - 1), 3) for i in range(count)})
    else:
        timestamps = payload.timestamps_seconds
    if not timestamps or len(timestamps) > 100:
        raise HTTPException(status_code=422, detail="Provide between 1 and 100 timestamps")
    if any(
        isinstance(timestamp, bool)
        or not isinstance(timestamp, (int, float))
        or not math.isfinite(timestamp)
        or timestamp < 0
        or timestamp > duration
        for timestamp in timestamps
    ):
        raise HTTPException(status_code=422, detail="Frame timestamps must be within the video duration")
    if timestamps != sorted(set(timestamps)):
        raise HTTPException(status_code=422, detail="Frame timestamps must be unique and ascending")

    run = await verify_video_evidence(
        db=db, evidence_id=evidence_id, user=user, timestamps_seconds=timestamps,
        sampling_strategy=payload.sampling_strategy,
    )
    return _run_response(db, run)

@router.get("/evidence/{evidence_id}/analysis", response_model=AnalysisRunResponse)
def latest_evidence_analysis(evidence_id: UUID, db: DbSession, user: CurrentUser) -> AnalysisRunResponse:
    evidence = db.get(Evidence, evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found")
    task = get_task(db, evidence.task_id)
    get_work_order(db, task.work_order_id, user)
    run = db.scalar(select(VerificationRun).where(
        VerificationRun.evidence_id == evidence.id
    ).order_by(VerificationRun.started_at.desc(), VerificationRun.created_at.desc()))
    if run is None:
        raise HTTPException(status_code=404, detail="No analysis has been run for this evidence")
    return _run_response(db, run)

@router.get("/tasks/{task_id}/analysis", response_model=list[AnalysisRunResponse])
def task_analyses(task_id: UUID, db: DbSession, user: CurrentUser) -> list[AnalysisRunResponse]:
    task = get_task(db, task_id)
    get_work_order(db, task.work_order_id, user)
    evidence_ids = select(Evidence.id).where(Evidence.task_id == task.id)
    runs = db.scalars(select(VerificationRun).where(
        VerificationRun.evidence_id.in_(evidence_ids)
    ).order_by(VerificationRun.started_at.desc())).all()
    return [_run_response(db, run) for run in runs]
