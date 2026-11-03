import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_roles
from app.core.dependencies import get_db
from app.models import User
from app.schemas.work_order import WorkOrderCreate, WorkOrderResponse, WorkOrderUpdate
from app.services.work_orders import (
    create_work_order,
    delete_work_order,
    get_work_order,
    list_work_orders,
    update_work_order,
)

router = APIRouter(prefix="/work-orders", tags=["Work Orders"])
DbSession = Annotated[Session, Depends(get_db)]
Manager = Annotated[User, Depends(require_roles("manager"))]
# A worker may create work, but only for themselves (enforced in the service).
Creator = Annotated[User, Depends(require_roles("manager", "worker"))]
# A worker may create work, but only for themselves (enforced in the service).


@router.post(
    "",
    response_model=WorkOrderResponse,
    status_code=status.HTTP_201_CREATED,
)
def create(
    payload: WorkOrderCreate,
    db: DbSession,
    creator: Creator,
) -> WorkOrderResponse:
    return create_work_order(db, creator, payload.model_dump())


@router.get("", response_model=list[WorkOrderResponse])
def list_orders(
    db: DbSession,
    user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[WorkOrderResponse]:
    return list_work_orders(db, user, limit, offset)


@router.get("/{order_id}", response_model=WorkOrderResponse)
def get_one(
    order_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
) -> WorkOrderResponse:
    return get_work_order(db, order_id, user)


@router.patch("/{order_id}", response_model=WorkOrderResponse)
def update(
    order_id: uuid.UUID,
    payload: WorkOrderUpdate,
    db: DbSession,
    manager: Manager,
) -> WorkOrderResponse:
    order = get_work_order(db, order_id, manager)
    changes = payload.model_dump(exclude_unset=True)
    return update_work_order(db, order, changes, manager.id)


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    order_id: uuid.UUID,
    db: DbSession,
    manager: Manager,
) -> Response:
    order = get_work_order(db, order_id, manager)
    delete_work_order(db, order)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
