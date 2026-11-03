import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_roles
from app.core.dependencies import get_db
from app.models import Requirement, User
from app.schemas.requirement import (
    RequirementCreate,
    RequirementResponse,
    RequirementUpdate,
)
from app.services.requirements import (
    create_requirement,
    delete_requirement,
    get_requirement,
    list_requirements,
    update_requirement,
)
from app.services.tasks import get_task
from app.services.work_orders import ensure_structure_editor, get_work_order

router = APIRouter(tags=["Checklist Requirements"])
DbSession = Annotated[Session, Depends(get_db)]
# Managers, and workers on work they created for themselves.
Creator = Annotated[User, Depends(require_roles("manager", "worker"))]


@router.post(
    "/tasks/{task_id}/requirements",
    response_model=RequirementResponse,
    status_code=status.HTTP_201_CREATED,
)
def create(
    task_id: uuid.UUID,
    payload: RequirementCreate,
    db: DbSession,
    user: Creator,
) -> Requirement:
    task = get_task(db, task_id)
    order = get_work_order(db, task.work_order_id, user)
    ensure_structure_editor(order, user, task)
    return create_requirement(db, task, payload.model_dump())


@router.get(
    "/tasks/{task_id}/requirements",
    response_model=list[RequirementResponse],
)
def list_for_task(
    task_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
) -> list[Requirement]:
    task = get_task(db, task_id)
    get_work_order(db, task.work_order_id, user)
    return list_requirements(db, task.id)


@router.patch(
    "/requirements/{requirement_id}",
    response_model=RequirementResponse,
)
def update(
    requirement_id: uuid.UUID,
    payload: RequirementUpdate,
    db: DbSession,
    user: Creator,
) -> Requirement:
    requirement = get_requirement(db, requirement_id)
    task = get_task(db, requirement.task_id)
    order = get_work_order(db, task.work_order_id, user)
    ensure_structure_editor(order, user, task)
    return update_requirement(
        db, requirement, payload.model_dump(exclude_unset=True)
    )


@router.delete(
    "/requirements/{requirement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete(
    requirement_id: uuid.UUID,
    db: DbSession,
    user: Creator,
) -> Response:
    requirement = get_requirement(db, requirement_id)
    task = get_task(db, requirement.task_id)
    order = get_work_order(db, task.work_order_id, user)
    ensure_structure_editor(order, user, task)
    delete_requirement(db, requirement)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
