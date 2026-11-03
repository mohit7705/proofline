from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_roles
from app.core.dependencies import get_db
from app.models import User
from app.schemas.task import LocationCreate, LocationResponse
from app.services.tasks import create_location, list_locations

router = APIRouter(prefix="/locations", tags=["Locations"])
DbSession = Annotated[Session, Depends(get_db)]
# Workers add a place when they create their own work.
Manager = Annotated[User, Depends(require_roles("manager", "worker"))]


@router.post(
    "",
    response_model=LocationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create(
    payload: LocationCreate,
    db: DbSession,
    manager: Manager,
) -> LocationResponse:
    return create_location(db, payload.model_dump())


@router.get("", response_model=list[LocationResponse])
def list_all(
    db: DbSession,
    user: CurrentUser,
) -> list[LocationResponse]:
    return list_locations(db)
