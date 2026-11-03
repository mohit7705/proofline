import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ScoreJobResponse(BaseModel):
    """Progress of an AI score run. status "none" means no run exists yet."""

    id: uuid.UUID | None = None
    task_id: uuid.UUID
    status: Literal["none", "queued", "processing", "completed", "failed"]
    error_code: str | None = None
    created_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class ScoreAnalysisResponse(BaseModel):
    """What the AI saw, for the latest finished run. Each item is documented in
    BACKEND_CONTRACT.md (before/after files, change summary, outlines, code check)."""

    task_id: uuid.UUID
    available: bool
    job_id: uuid.UUID | None = None
    mock: bool = False
    generated_at: datetime | None = None
    items: list[dict[str, Any]] = Field(default_factory=list)
    retake_notes: list[str] = Field(default_factory=list)
