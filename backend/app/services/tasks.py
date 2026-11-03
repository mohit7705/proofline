import uuid

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Location, Task, User, WorkOrder
from app.services.audit import record_event


VALID_TASK_STATUSES = {
    "pending", "in_progress", "submitted", "approved", "rejected"
}


def validate_task_references(
    db: Session,
    assigned_to: uuid.UUID | None,
    location_id: uuid.UUID | None,
) -> None:
    if assigned_to is not None:
        user = db.get(User, assigned_to)
        if user is None or not user.is_active or user.role != "worker":
            raise HTTPException(
                status_code=422,
                detail="Assignee must be an active worker",
            )

    if location_id is not None and db.get(Location, location_id) is None:
        raise HTTPException(status_code=422, detail="Location not found")


def _plain(value):
    return str(value) if isinstance(value, uuid.UUID) else value


def list_tasks(db: Session, work_order_id: uuid.UUID) -> list[Task]:
    return list(
        db.scalars(
            select(Task)
            .options(selectinload(Task.assignee))
            .where(Task.work_order_id == work_order_id)
            .order_by(Task.position, Task.created_at)
        ).all()
    )


def create_task(
    db: Session,
    order: WorkOrder,
    data: dict,
    actor_id: uuid.UUID | None = None,
) -> Task:
    validate_task_references(
        db, data.get("assigned_to"), data.get("location_id")
    )
    task = Task(work_order_id=order.id, **data)
    db.add(task)
    db.flush()
    record_event(
        db,
        actor_id,
        "task",
        task.id,
        "task.created",
        {"title": task.title, "work_order_id": str(order.id)},
    )
    db.commit()
    db.refresh(task)
    return task


def update_task(
    db: Session,
    task: Task,
    changes: dict,
    actor_id: uuid.UUID | None = None,
) -> Task:
    if (
        "status" in changes
        and changes["status"] not in VALID_TASK_STATUSES
    ):
        raise HTTPException(status_code=422, detail="Invalid task status")

    validate_task_references(
        db,
        changes.get("assigned_to", task.assigned_to),
        changes.get("location_id", task.location_id),
    )

    details = {
        field: [_plain(getattr(task, field)), _plain(value)]
        for field, value in changes.items()
        if getattr(task, field) != value
    }

    for field, value in changes.items():
        setattr(task, field, value)

    if details:
        record_event(db, actor_id, "task", task.id, "task.updated", details)
    db.commit()
    db.refresh(task)
    return task


def get_task(db: Session, task_id: uuid.UUID) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _purge_children(db: Session, parent, parent_keys, path: frozenset) -> None:
    """Delete every row that points at the parent rows, deepest rows first."""
    for table in parent.metadata.sorted_tables:
        if table is parent or table.name in path:
            continue
        for fk in table.foreign_keys:
            if fk.column.table is not parent:
                continue
            link = fk.parent
            keys = list(table.primary_key.columns)
            if len(keys) == 1:
                child_keys = select(keys[0]).where(link.in_(parent_keys))
                _purge_children(db, table, child_keys, path | {parent.name})
            db.execute(delete(table).where(link.in_(parent_keys)))


def _purge_row(db: Session, model, row_id) -> None:
    table = model.__table__
    keys = select(table.c.id).where(table.c.id == row_id)
    _purge_children(db, table, keys, frozenset())
    db.execute(delete(table).where(table.c.id == row_id))


def delete_task(db: Session, task: Task) -> None:
    """Delete a task with its requirements, files, scores and reviews.

    A self-created work order that has no task left is removed too.
    """
    task_id, order_id = task.id, task.work_order_id
    order = db.get(WorkOrder, order_id)
    self_created = bool(order and order.is_self_created)
    others = db.scalar(
        select(func.count())
        .select_from(Task)
        .where(Task.work_order_id == order_id, Task.id != task_id)
    )
    try:
        _purge_row(db, Task, task_id)
        if self_created and not others:
            _purge_row(db, WorkOrder, order_id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.expire_all()


def create_location(db: Session, data: dict) -> Location:
    location = Location(**data)
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


def list_locations(db: Session) -> list[Location]:
    return list(
        db.scalars(
            select(Location).order_by(Location.site, Location.building)
        ).all()
    )
