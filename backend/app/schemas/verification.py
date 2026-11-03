import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Decision = Literal[
    "VERIFIED",
    "NEEDS_MORE_EVIDENCE",
    "FAILED_INSPECTION",
    "NEEDS_HUMAN_REVIEW",
]


class RequirementResult(BaseModel):
    requirement_id: uuid.UUID
    decision: Decision
    explanation: str
    evidence_ids: list[uuid.UUID] = Field(default_factory=list)
    timestamps_seconds: list[float] = Field(default_factory=list)


class IntegritySignal(BaseModel):
    label: str
    detail: str
    severity: Literal["info", "warning", "critical"]
    evidence_id: uuid.UUID | None = None


class FollowUp(BaseModel):
    instruction: str
    attempts_left: int


class VerificationBody(BaseModel):
    """The part of a result that is stored as JSON."""

    decision: Decision
    summary: str
    requirement_results: list[RequirementResult]
    integrity_signals: list[IntegritySignal]
    follow_up: FollowUp | None = None


class VerificationResponse(VerificationBody):
    task_id: uuid.UUID
    created_at: datetime
