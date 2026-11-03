import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from app.api import ai_jobs
from app.api.auth import CurrentUser, require_roles
from app.core.dependencies import get_db
from app.models import User
from app.schemas.evidence import EvidenceResponse
from app.schemas.review import AuditEventResponse, ReviewCreate, ReviewResponse
from app.schemas.task import TaskResponse
from app.services.work_orders import get_work_order
from app.services.workflow import (
    create_review,
    get_task_for_user,
    list_audit,
    list_reviews,
    list_task_evidence,
    submit_task,
)
from app.services.score_jobs import queue_job, run_score_job

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Workflow"])
DbSession = Annotated[Session, Depends(get_db)]
Submitter = Annotated[User, Depends(require_roles("worker", "manager"))]
Reviewer = Annotated[User, Depends(require_roles("manager"))]


async def _run_submission_score(job_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Run the queued AI score using a separate DB session after the submit response."""
    with ai_jobs.get_session_factory()() as db:
        try:
            await run_score_job(db, job_id, user_id)
        except Exception:
            logger.exception("AI score job %s crashed after task submission", job_id)


@router.get("/tasks/{task_id}/evidence", response_model=list[EvidenceResponse])
def task_evidence(task_id: uuid.UUID, db: DbSession, user: CurrentUser):
    task = get_task_for_user(db, task_id, user)
    return list_task_evidence(db, task)


@router.post("/tasks/{task_id}/submit", response_model=TaskResponse)
def submit(
    task_id: uuid.UUID,
    background: BackgroundTasks,
    db: DbSession,
    user: Submitter,
):
    task = get_task_for_user(db, task_id, user)
    submitted_task = submit_task(db, task, user)

    try:
        job = queue_job(db, submitted_task, user)
        background.add_task(_run_submission_score, job.id, user.id)
        logger.info("Queued AI score job %s for submitted task %s", job.id, submitted_task.id)
    except Exception:
        logger.exception(
            "Task %s was submitted, but its AI score could not be queued",
            submitted_task.id,
        )

    return submitted_task


@router.get("/tasks/{task_id}/reviews", response_model=list[ReviewResponse])
def task_reviews(task_id: uuid.UUID, db: DbSession, user: CurrentUser):
    task = get_task_for_user(db, task_id, user)
    return list_reviews(db, task)


@router.post(
    "/tasks/{task_id}/reviews",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
def review(
    task_id: uuid.UUID,
    payload: ReviewCreate,
    db: DbSession,
    reviewer: Reviewer,
):
    task = get_task_for_user(db, task_id, reviewer)
    return create_review(db, task, reviewer, payload.decision, payload.reason)


@router.get(
    "/work-orders/{order_id}/audit", response_model=list[AuditEventResponse]
)
def work_order_audit(
    order_id: uuid.UUID,
    db: DbSession,
    user: Reviewer,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    order = get_work_order(db, order_id, user)
    return list_audit(db, order, limit, offset)
