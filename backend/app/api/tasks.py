import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_roles
from app.core.dependencies import get_db
from app.models import Task, User
from app.schemas.task import TaskCreate, TaskResponse, TaskUpdate
from app.services.tasks import (
    create_task,
    delete_task,
    get_task,
    list_tasks,
    update_task,
)
from app.services.work_orders import (
    EDITABLE_TASK_STATES,
    WORKER_TASK_FIELDS,
    ensure_structure_editor,
    get_work_order,
)

router = APIRouter(tags=["Tasks"])
DbSession = Annotated[Session, Depends(get_db)]
# Managers, and workers on work they created for themselves.
Creator = Annotated[User, Depends(require_roles("manager", "worker"))]


@router.post(
    "/work-orders/{work_order_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create(
    work_order_id: uuid.UUID,
    payload: TaskCreate,
    db: DbSession,
    user: Creator,
) -> Task:
    order = get_work_order(db, work_order_id, user)
    ensure_structure_editor(order, user)
    data = payload.model_dump()
    if user.role == "worker":
        if data.get("assigned_to") not in (None, user.id):
            raise HTTPException(
                status_code=403,
                detail="Workers can only create tasks for themselves",
            )
        data["assigned_to"] = user.id
    return create_task(db, order, data, user.id)


@router.get(
    "/work-orders/{work_order_id}/tasks",
    response_model=list[TaskResponse],
)
def list_for_order(
    work_order_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
) -> list[Task]:
    get_work_order(db, work_order_id, user)
    return list_tasks(db, work_order_id)


def _worker_owns(order, user: User) -> bool:
    return bool(order.is_self_created and order.created_by == user.id)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    db: DbSession,
    user: Creator,
) -> Task:
    task = get_task(db, task_id)
    order = get_work_order(db, task.work_order_id, user)
    if user.role == "worker":
        own = _worker_owns(order, user)
        if not own and task.assigned_to != user.id:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        if not own and task.status not in EDITABLE_TASK_STATES:
            raise HTTPException(
                status_code=409,
                detail="This task is with a reviewer and can no longer be changed",
            )
    changes = payload.model_dump(exclude_unset=True)
    if user.role == "worker" and set(changes) - WORKER_TASK_FIELDS:
        raise HTTPException(
            status_code=403,
            detail="Workers can change a task's title, instructions and location only",
        )
    return update_task(db, task, changes, user.id)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    task_id: uuid.UUID,
    db: DbSession,
    user: Creator,
) -> Response:
    task = get_task(db, task_id)
    order = get_work_order(db, task.work_order_id, user)
    if user.role == "worker" and not _worker_owns(order, user):
        raise HTTPException(
            status_code=403,
            detail="You can delete only work you created yourself",
        )
    delete_task(db, task)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
