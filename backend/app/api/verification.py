import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_roles
from app.core.dependencies import get_db
from app.models import User
from app.schemas.verification import VerificationResponse
from app.services.verification_engine import (
    is_stale,
    latest_verification,
    run_verification,
    to_response,
)
from app.services.workflow import get_task_for_user

router = APIRouter(tags=["Verification"])
DbSession = Annotated[Session, Depends(get_db)]
Reviewer = Annotated[User, Depends(require_roles("manager"))]


@router.get("/tasks/{task_id}/verification", response_model=VerificationResponse)
def get_verification(task_id: uuid.UUID, db: DbSession, user: CurrentUser):
    """Return the latest task result, recalculating when evidence has changed."""
    task = get_task_for_user(db, task_id, user)
    row = latest_verification(db, task)
    if row is None or is_stale(db, task, row):
        row = run_verification(db, task, user.id, "view")
        db.commit()
    return to_response(row)


@router.post("/tasks/{task_id}/verification", response_model=VerificationResponse)
def recalculate_verification(
    task_id: uuid.UUID,
    db: DbSession,
    user: Reviewer,
):
    """Force a new result, for example after running video analysis."""
    task = get_task_for_user(db, task_id, user)
    row = run_verification(db, task, user.id, "manual")
    db.commit()
    return to_response(row)
