import uuid
from datetime import UTC, datetime
import logging

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AuditEvent,
    Evidence,
    Requirement,
    ReviewDecision,
    Task,
    User,
    WorkOrder,
)
from app.services.audit import record_event
from app.services.evidence_phases import gap_text, phase_gaps
from app.services.tasks import get_task, list_tasks
from app.services.verification_engine import run_verification
from app.services.work_orders import get_work_order

REVIEW_TASK_STATUS = {
    "approved": "approved",
    "rejected": "rejected",
    "needs_more_evidence": "in_progress",
    "escalate": "submitted",
}

logger = logging.getLogger(__name__)


def get_task_for_user(db: Session, task_id: uuid.UUID, user: User) -> Task:
    """Load a task the user is allowed to see (workers: assigned work only)."""
    task = get_task(db, task_id)
    get_work_order(db, task.work_order_id, user)
    if (
        user.role == "worker"
        and task.assigned_to is not None
        and task.assigned_to != user.id
    ):
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def list_task_evidence(db: Session, task: Task) -> list[Evidence]:
    return list(
        db.scalars(
            select(Evidence)
            .where(Evidence.task_id == task.id)
            .order_by(Evidence.uploaded_at, Evidence.id)
        ).all()
    )


def missing_evidence(db: Session, task: Task) -> list[str]:
    """Describe required checklist items that do not have enough evidence."""
    requirements = db.scalars(
        select(Requirement).where(Requirement.task_id == task.id)
    ).all()
    problems: list[str] = []
    for requirement in requirements:
        if not requirement.is_required:
            continue
        needed = requirement.minimum_evidence_count
        if needed == 0 and requirement.response_type in {"photo", "video"}:
            needed = 1
        files = list(
            db.scalars(
                select(Evidence).where(Evidence.requirement_id == requirement.id)
            ).all()
        )
        have = len(files)
        if requirement.requires_before_after:
            gaps = phase_gaps(files)
            if gaps:
                problems.append(f"{requirement.title} ({gap_text(gaps)})")
                continue
        if have < needed:
            problems.append(f"{requirement.title} ({needed - have} more)")
    return problems


def roll_up_work_order(
    db: Session, order: WorkOrder, actor_id: uuid.UUID | None
) -> None:
    """Keep the work-order status in line with the status of its tasks."""
    if order.status in {"draft", "cancelled"}:
        return

    db.flush()
    statuses = [task.status for task in list_tasks(db, order.id)]
    if not statuses:
        return

    open_work = {"pending", "in_progress"} & set(statuses)
    if open_work:
        new_status = "in_progress" if set(statuses) != {"pending"} else order.status
    elif "submitted" in statuses:
        reviewed = {"approved", "rejected"} & set(statuses)
        new_status = "under_review" if reviewed else "submitted"
    else:
        new_status = "rejected" if "rejected" in statuses else "approved"

    if new_status != order.status:
        record_event(
            db,
            actor_id,
            "work_order",
            order.id,
            "work_order.status_changed",
            {"from": order.status, "to": new_status},
        )
        order.status = new_status


def submit_task(db: Session, task: Task, user: User) -> Task:
    if task.status in {"submitted", "approved"}:
        raise HTTPException(
            status_code=409, detail=f"Task is already {task.status}"
        )

    if not list_task_evidence(db, task):
        raise HTTPException(
            status_code=422, detail="Add evidence before submitting this task"
        )

    problems = missing_evidence(db, task)
    if problems:
        raise HTTPException(
            status_code=422,
            detail="Missing required evidence: " + ", ".join(problems),
        )

    previous = task.status
    task.status = "submitted"
    record_event(
        db,
        user.id,
        "task",
        task.id,
        "task.submitted",
        {"from": previous, "evidence_count": len(list_task_evidence(db, task))},
    )
    try:
        with db.begin_nested():
            run_verification(db, task, user.id, "submit")
    except Exception:
        logger.exception("Verification failed for task %s", task.id)
    roll_up_work_order(db, task.work_order, user.id)
    db.commit()
    db.refresh(task)
    return task


def list_reviews(db: Session, task: Task) -> list[ReviewDecision]:
    return list(
        db.scalars(
            select(ReviewDecision)
            .where(ReviewDecision.task_id == task.id)
            .order_by(ReviewDecision.created_at.desc(), ReviewDecision.id)
        ).all()
    )


def create_review(
    db: Session, task: Task, reviewer: User, decision: str, reason: str
) -> ReviewDecision:
    if task.status != "submitted":
        raise HTTPException(
            status_code=409,
            detail="Only a submitted task can be reviewed",
        )

    # Four eyes: nobody reviews work they created or uploaded evidence for.
    order = task.work_order
    if order.is_self_created and order.created_by == reviewer.id:
        raise HTTPException(
            status_code=403, detail="You cannot review work you created"
        )
    own_upload = db.scalar(
        select(Evidence.id)
        .where(Evidence.task_id == task.id, Evidence.submitted_by == reviewer.id)
        .limit(1)
    )
    if own_upload is not None:
        raise HTTPException(
            status_code=403,
            detail="You cannot review a task you uploaded evidence for",
        )

    review = ReviewDecision(
        task_id=task.id,
        reviewer_id=reviewer.id,
        decision=decision,
        reason=reason,
        created_at=datetime.now(UTC),
    )
    db.add(review)
    db.flush()

    previous = task.status
    task.status = REVIEW_TASK_STATUS[decision]
    record_event(
        db,
        reviewer.id,
        "task",
        task.id,
        "review.saved",
        {
            "review_id": str(review.id),
            "decision": decision,
            "reason": reason,
            "task_status_from": previous,
            "task_status_to": task.status,
        },
    )
    roll_up_work_order(db, task.work_order, reviewer.id)
    db.commit()
    db.refresh(review)
    return review


def list_audit(
    db: Session, order: WorkOrder, limit: int, offset: int
) -> list[AuditEvent]:
    """Events for the work order, its tasks and their evidence, newest first."""
    task_ids = [task.id for task in list_tasks(db, order.id)]
    evidence_ids = (
        list(
            db.scalars(
                select(Evidence.id).where(Evidence.task_id.in_(task_ids))
            ).all()
        )
        if task_ids
        else []
    )
    ids = [order.id, *task_ids, *evidence_ids]
    return list(
        db.scalars(
            select(AuditEvent)
            .where(AuditEvent.entity_id.in_(ids))
            .order_by(AuditEvent.created_at.desc(), AuditEvent.id)
            .offset(offset)
            .limit(limit)
        ).all()
    )
