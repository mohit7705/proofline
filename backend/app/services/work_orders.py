import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload, selectinload

from app.models import User, WorkOrder
from app.services.audit import record_event


VALID_STATUSES = {
    "draft", "open", "in_progress", "submitted",
    "under_review", "approved", "rejected", "cancelled",
}


def _plain(value):
    if isinstance(value, uuid.UUID):
        return str(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def validate_assignee(db: Session, assignee_id: uuid.UUID | None) -> None:
    if assignee_id is None:
        return

    assignee = db.get(User, assignee_id)
    if assignee is None or not assignee.is_active or assignee.role != "worker":
        raise HTTPException(
            status_code=422,
            detail="Assignee must be an active worker",
        )


EDITABLE_TASK_STATES = {"pending", "in_progress", "rejected"}
WORKER_TASK_FIELDS = {"title", "instructions", "location_id", "position"}


def ensure_structure_editor(
    order: WorkOrder, user: User, task=None
) -> None:
    """Who may add or change tasks and checklist items on a work order.

    Managers always. A worker only on work they created for themselves, and
    only while the task is still open for changes.
    """
    if user.role == "manager":
        return
    if user.role == "worker" and order.is_self_created and order.created_by == user.id:
        if task is not None and task.status not in EDITABLE_TASK_STATES:
            raise HTTPException(
                status_code=409,
                detail="This task is with a reviewer and can no longer be changed",
            )
        return
    raise HTTPException(status_code=403, detail="Insufficient permissions")


def create_work_order(db: Session, creator: User, data: dict) -> WorkOrder:
    data = dict(data)
    if creator.role == "worker":
        # A worker can only create work for themselves. It opens at once and
        # is marked so reviewers can see nobody assigned it.
        if data.get("assigned_to") not in (None, creator.id):
            raise HTTPException(
                status_code=403,
                detail="Workers can only create work for themselves",
            )
        data["assigned_to"] = creator.id
        data["is_self_created"] = True
        first_status = "open"
    else:
        first_status = "draft"

    validate_assignee(db, data.get("assigned_to"))
    order = WorkOrder(created_by=creator.id, status=first_status, **data)
    db.add(order)
    db.flush()
    record_event(
        db,
        creator.id,
        "work_order",
        order.id,
        "work_order.created",
        {"title": order.title, "self_created": order.is_self_created},
    )
    db.commit()
    db.refresh(order)
    return order


def list_work_orders(
    db: Session,
    user: User,
    limit: int = 50,
    offset: int = 0,
) -> list[WorkOrder]:
    query = select(WorkOrder).options(
        selectinload(WorkOrder.creator), selectinload(WorkOrder.assignee)
    )

    if user.role == "worker":
        query = query.where(WorkOrder.assigned_to == user.id)

    query = query.order_by(WorkOrder.created_at.desc())
    return list(db.scalars(query.offset(offset).limit(limit)).all())


def get_work_order(
    db: Session,
    order_id: uuid.UUID,
    user: User,
) -> WorkOrder:
    order = db.get(WorkOrder, order_id)

    if order is None:
        raise HTTPException(status_code=404, detail="Work order not found")

    if user.role == "worker" and order.assigned_to != user.id:
        raise HTTPException(status_code=404, detail="Work order not found")

    return order


def update_work_order(
    db: Session,
    order: WorkOrder,
    changes: dict,
    actor_id: uuid.UUID | None = None,
) -> WorkOrder:
    if "status" in changes and changes["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid work-order status")

    if "assigned_to" in changes:
        validate_assignee(db, changes["assigned_to"])

    details = {
        field: [_plain(getattr(order, field)), _plain(value)]
        for field, value in changes.items()
        if getattr(order, field) != value
    }

    for field, value in changes.items():
        setattr(order, field, value)

    if details:
        record_event(
            db, actor_id, "work_order", order.id, "work_order.updated", details
        )
    db.commit()
    db.refresh(order)
    return order


def delete_work_order(db: Session, order: WorkOrder) -> None:
    if order.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Only draft work orders can be deleted",
        )

    if order.tasks:
        raise HTTPException(
            status_code=409,
            detail="Remove associated tasks before deleting this work order",
        )

    db.delete(order)
    db.commit()
