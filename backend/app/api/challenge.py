import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_roles
from app.core.dependencies import get_db
from app.models import User
from app.schemas.scoring import ChallengeResponse
from app.services.challenge import ensure_code, rotate_code
from app.services.workflow import get_task_for_user

router = APIRouter(tags=["Challenge code"])
DbSession = Annotated[Session, Depends(get_db)]
Submitter = Annotated[User, Depends(require_roles("worker", "manager"))]


def _response(task) -> ChallengeResponse:
    return ChallengeResponse(
        task_id=task.id, code=task.challenge_code, issued_at=task.challenge_issued_at
    )


@router.get("/tasks/{task_id}/challenge", response_model=ChallengeResponse)
def get_challenge(task_id: uuid.UUID, db: DbSession, user: CurrentUser):
    """The phrase to say on camera in the After video. Created on first use."""
    task = get_task_for_user(db, task_id, user)
    ensure_code(db, task, user.id)
    db.commit()
    return _response(task)


@router.post("/tasks/{task_id}/challenge/rotate", response_model=ChallengeResponse)
def new_challenge(task_id: uuid.UUID, db: DbSession, user: Submitter):
    """Issue a new phrase, for example before recording a fresh After video."""
    task = get_task_for_user(db, task_id, user)
    rotate_code(db, task, user.id)
    db.commit()
    return _response(task)
