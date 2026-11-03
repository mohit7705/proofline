import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Band = Literal["strong", "check", "weak", "not_scored"]


class ScorePart(BaseModel):
    """One named input to a score, so nobody sees a number without its parts."""

    key: str
    label: str
    score: int | None = Field(default=None, ge=0, le=100)
    detail: str = ""


class ItemScore(BaseModel):
    requirement_id: uuid.UUID | None = None
    score: int | None = Field(default=None, ge=0, le=100)
    band: Band
    parts: list[ScorePart] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)


class ScoreSetResponse(BaseModel):
    """The latest score for a task: the task-level row plus one row per item."""

    task_id: uuid.UUID
    scored: bool
    stale: bool = False
    created_at: datetime | None = None
    model_name: str | None = None
    model_version: str | None = None
    task: ItemScore | None = None
    items: list[ItemScore] = Field(default_factory=list)


class ChallengeResponse(BaseModel):
    task_id: uuid.UUID
    code: str
    issued_at: datetime
