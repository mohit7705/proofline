import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser
from app.core.dependencies import get_db
from app.schemas.scoring import ScoreSetResponse
from app.services.scoring import latest_score_set
from app.services.workflow import get_task_for_user

router = APIRouter(tags=["Scores"])
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/tasks/{task_id}/score", response_model=ScoreSetResponse)
def get_score(task_id: uuid.UUID, db: DbSession, user: CurrentUser):
    """The latest AI score for a task. Advice only: a person decides.

    "scored": false means no score exists yet, or none could be worked out.
    """
    task = get_task_for_user(db, task_id, user)
    return latest_score_set(db, task)
