"""Run the AI score for a task, follow its progress, read what the AI saw.

The score itself is read with GET /tasks/{id}/score (api/scores.py).
A score is advice only: a person makes the decision.
"""

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.orm import Session

from app.api import ai_jobs
from app.api.auth import CurrentUser
from app.core.dependencies import get_db
from app.schemas.score_job import ScoreAnalysisResponse, ScoreJobResponse
from app.services.score_jobs import (
    ensure_can_start,
    latest_finished_job,
    latest_job,
    queue_job,
    run_score_job,
)
from app.services.workflow import get_task_for_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["AI score"])
DbSession = Annotated[Session, Depends(get_db)]


async def _run_in_background(job_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Runs after the response was sent, with its own database session."""
    with ai_jobs.get_session_factory()() as db:
        try:
            await run_score_job(db, job_id, user_id)
        except Exception:  # the failure is also saved on the job itself
            logger.exception("AI score job %s crashed", job_id)


@router.post(
    "/tasks/{task_id}/score/run",
    response_model=ScoreJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def run_score(
    task_id: uuid.UUID,
    background: BackgroundTasks,
    db: DbSession,
    user: CurrentUser,
):
    """Start the AI score. Answers at once; poll GET /tasks/{id}/score/job.

    Workers may run it on their own tasks (limited per hour), and
    managers on any task they can see.
    """
    task = get_task_for_user(db, task_id, user)
    ensure_can_start(db, task, user)
    job = queue_job(db, task, user)
    background.add_task(_run_in_background, job.id, user.id)
    return ScoreJobResponse(
        id=job.id, task_id=task.id, status="queued", created_at=job.created_at
    )


@router.get("/tasks/{task_id}/score/job", response_model=ScoreJobResponse)
def get_score_job(task_id: uuid.UUID, db: DbSession, user: CurrentUser):
    """Progress of the latest run. status "none" when nothing was ever started."""
    task = get_task_for_user(db, task_id, user)
    job = latest_job(db, task.id)
    if job is None:
        return ScoreJobResponse(task_id=task.id, status="none")
    return ScoreJobResponse(
        id=job.id,
        task_id=task.id,
        status=job.status,
        error_code=job.error_code,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )


@router.get("/tasks/{task_id}/score/analysis", response_model=ScoreAnalysisResponse)
def get_score_analysis(task_id: uuid.UUID, db: DbSession, user: CurrentUser):
    """What the AI saw in the latest finished run: before/after files, what
    changed, the outlined part, the challenge code check and retake notes."""
    task = get_task_for_user(db, task_id, user)
    job = latest_finished_job(db, task.id)
    if job is None:
        return ScoreAnalysisResponse(task_id=task.id, available=False)
    findings = job.findings or {}
    return ScoreAnalysisResponse(
        task_id=task.id,
        available=True,
        job_id=job.id,
        mock=bool(findings.get("mock")),
        generated_at=job.completed_at,
        items=findings.get("items", []),
        retake_notes=findings.get("retake_notes", []),
    )
