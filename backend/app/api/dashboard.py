import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser
from app.core.dependencies import get_db
from app.services import dashboard as service

router = APIRouter(tags=["Dashboard"])
DbSession = Annotated[Session, Depends(get_db)]


class NotificationResponse(BaseModel):
    id: str
    kind: str
    title: str
    detail: str
    task_id: uuid.UUID
    work_order_id: uuid.UUID
    created_at: datetime | None


@router.get("/dashboard/summary")
def dashboard_summary(db: DbSession, user: CurrentUser) -> dict:
    """Counts for the overview screen. Workers only see their own work."""
    return service.summary(db, user)


@router.get("/notifications", response_model=list[NotificationResponse])
def list_notifications(
    db: DbSession,
    user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=100),
):
    """Things that need this user's attention, newest first."""
    return service.notifications(db, user, limit)
