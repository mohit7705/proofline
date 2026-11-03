import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth import require_roles
from app.core.dependencies import get_db
from app.models.user import User
from app.core.security import hash_password
from app.schemas.auth import UserCreate, UserResponse
from app.services.audit import record_event

router = APIRouter(prefix="/users", tags=["User Management"])

DbSession = Annotated[Session, Depends(get_db)]
Manager = Annotated[User, Depends(require_roles("manager"))]
Staff = Manager


class DirectoryEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    role: str


class RoleUpdate(BaseModel):
    role: Literal["manager", "worker"]


@router.get("", response_model=list[UserResponse])
def list_users(
    db: DbSession,
    manager: Manager,
) -> list[User]:
    """List registered users. Managers only."""
    statement = select(User).order_by(User.email.asc())
    return list(db.scalars(statement).all())


@router.post("", response_model=UserResponse, status_code=201)
def add_member(payload: UserCreate, db: DbSession, manager: Manager) -> User:
    """A manager adds a team member with a starting password and a role."""
    user = User(
        email=str(payload.email).lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=payload.role,
        is_active=True,
    )
    if len(user.full_name) < 2:
        raise HTTPException(status_code=422, detail="Name must contain at least 2 characters")
    db.add(user)
    try:
        db.flush()
        record_event(db, manager.id, "user", user.id, "user.created", {"role": user.role})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="An account with this email already exists"
        ) from None
    db.refresh(user)
    return user




@router.get("/directory", response_model=list[DirectoryEntry])
def user_directory(db: DbSession, staff: Staff) -> list[User]:
    """Names of active users, for managers reading task history."""
    statement = select(User).where(User.is_active.is_(True)).order_by(User.full_name.asc())
    return list(db.scalars(statement).all())


@router.patch("/{user_id}/role", response_model=UserResponse)
def assign_role(
    user_id: uuid.UUID,
    payload: RoleUpdate,
    db: DbSession,
    manager: Manager,
) -> User:
    if user_id == manager.id:
        raise HTTPException(
            status_code=403,
            detail="Managers cannot change their own role",
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = payload.role
    db.commit()
    db.refresh(user)
    return user
