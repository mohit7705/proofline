import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReviewCreate(BaseModel):
    decision: Literal[
        "approved", "rejected", "needs_more_evidence", "escalate"
    ]
    reason: str = Field(min_length=3, max_length=5000)

    @field_validator("reason")
    @classmethod
    def reason_not_blank(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("A reason is required")
        return value


class ReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    reviewer_id: uuid.UUID
    decision: str
    reason: str
    created_at: datetime


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: uuid.UUID | None
    entity_type: str
    entity_id: uuid.UUID
    action: str
    details: dict[str, Any]
    created_at: datetime
