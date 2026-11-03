import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Evidence,
    ReviewDecision,
    Task,
    TaskVerification,
    User,
    WorkOrder,
)

CLOSED_ORDERS = {"approved", "rejected", "cancelled"}


def _scope(user: User):
    """Workers see only their own work. Everyone else sees all work."""
    if user.role == "worker":
        return (WorkOrder.assigned_to == user.id, Task.assigned_to == user.id)
    return (True, True)


def _latest_verification_decisions(
    db: Session, task_ids: list[uuid.UUID]
) -> dict[uuid.UUID, str]:
    if not task_ids:
        return {}
    rows = db.scalars(
        select(TaskVerification)
        .where(TaskVerification.task_id.in_(task_ids))
        .order_by(TaskVerification.created_at.desc(), TaskVerification.id)
    ).all()
    latest: dict[uuid.UUID, str] = {}
    for row in rows:
        latest.setdefault(row.task_id, row.decision)
    return latest


def summary(db: Session, user: User) -> dict:
    order_scope, task_scope = _scope(user)

    orders = dict(
        db.execute(
            select(WorkOrder.status, func.count())
            .where(order_scope)
            .group_by(WorkOrder.status)
        ).all()
    )
    tasks = dict(
        db.execute(
            select(Task.status, func.count()).where(task_scope).group_by(Task.status)
        ).all()
    )

    submitted_ids = list(
        db.scalars(
            select(Task.id).where(task_scope, Task.status == "submitted")
        ).all()
    )
    decisions = _latest_verification_decisions(db, submitted_ids)

    evidence_query = select(Evidence.integrity_status, func.count()).group_by(
        Evidence.integrity_status
    )
    if user.role == "worker":
        evidence_query = evidence_query.where(Evidence.submitted_by == user.id)
    integrity = dict(db.execute(evidence_query).all())

    now = datetime.now(timezone.utc)
    overdue = 0
    for due, state in db.execute(
        select(WorkOrder.due_at, WorkOrder.status).where(
            order_scope, WorkOrder.due_at.is_not(None)
        )
    ).all():
        if state in CLOSED_ORDERS:
            continue
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        if due < now:
            overdue += 1

    return {
        "work_orders": orders,
        "work_orders_total": sum(orders.values()),
        "tasks": tasks,
        "tasks_total": sum(tasks.values()),
        "awaiting_review": len(submitted_ids),
        "needs_human_review": sum(
            1 for value in decisions.values() if value == "NEEDS_HUMAN_REVIEW"
        ),
        "evidence_issues": {
            "flagged": integrity.get("flagged", 0),
            "failed": integrity.get("failed", 0),
        },
        "overdue_work_orders": overdue,
    }


def notifications(db: Session, user: User, limit: int = 100) -> list[dict]:
    items: list[dict] = []

    def add(kind, task, title, detail, when):
        items.append(
            {
                "id": f"{kind}:{task.id}",
                "kind": kind,
                "title": title,
                "detail": detail,
                "task_id": task.id,
                "work_order_id": task.work_order_id,
                "created_at": when,
            }
        )

    if user.role == "worker":
        tasks = db.scalars(
            select(Task).where(
                Task.assigned_to == user.id,
                Task.status.in_(["pending", "in_progress", "rejected"]),
            )
        ).all()
        for task in tasks:
            last = db.scalar(
                select(ReviewDecision)
                .where(ReviewDecision.task_id == task.id)
                .order_by(ReviewDecision.created_at.desc(), ReviewDecision.id)
                .limit(1)
            )
            if last and last.decision in {"needs_more_evidence", "rejected"}:
                add(
                    "sent_back",
                    task,
                    f"Sent back: {task.title}",
                    last.reason,
                    last.created_at,
                )
            elif task.status == "pending":
                add("task_assigned", task, f"New task: {task.title}", "Capture the evidence.", task.created_at)
    else:
        submitted = db.scalars(select(Task).where(Task.status == "submitted")).all()
        decisions = _latest_verification_decisions(db, [t.id for t in submitted])
        for task in submitted:
            note = decisions.get(task.id)
            detail = "Ready for your decision."
            if note == "NEEDS_HUMAN_REVIEW":
                detail = "The AI could not decide. A person must look at it."
            elif note == "FAILED_INSPECTION":
                detail = "An evidence file failed the integrity check."
            add("review_needed", task, f"Review needed: {task.title}", detail, task.updated_at)

        bad = db.scalars(
            select(Evidence).where(Evidence.integrity_status.in_(["flagged", "failed"]))
        ).all()
        seen: set[uuid.UUID] = set()
        for item in bad:
            if item.task_id in seen:
                continue
            seen.add(item.task_id)
            task = db.get(Task, item.task_id)
            if task is not None:
                add(
                    "evidence_issue",
                    task,
                    f"Evidence issue: {task.title}",
                    f"A file is marked {item.integrity_status}.",
                    item.uploaded_at,
                )

    def sort_key(entry):
        when = entry["created_at"]
        if when is not None and when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        return when or datetime.min.replace(tzinfo=timezone.utc)

    items.sort(key=sort_key, reverse=True)
    return items[:limit]
