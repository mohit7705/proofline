import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class TaskScore(TimestampMixin, Base):
    """One saved AI score row. A scoring run writes one row per checklist item
    plus one task-level row (requirement_id is NULL), all sharing a batch_id.

    A score is advice for the reviewer. It never approves or rejects a task.
    """

    __tablename__ = "task_scores"
    __table_args__ = (
        CheckConstraint(
            "score IS NULL OR (score >= 0 AND score <= 100)",
            name="ck_task_scores_score",
        ),
        CheckConstraint(
            "band IN ('strong', 'check', 'weak', 'not_scored')",
            name="ck_task_scores_band",
        ),
        Index("ix_task_scores_task_created", "task_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id"), index=True, nullable=False
    )
    requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("requirements.id"), nullable=True
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(index=True, nullable=False)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    band: Mapped[str] = mapped_column(String(12), nullable=False)
    parts: Mapped[list[Any]] = mapped_column(JSON, default=list, nullable=False)
    reasons: Mapped[list[Any]] = mapped_column(JSON, default=list, nullable=False)
    model_name: Mapped[str] = mapped_column(String(150), default="", nullable=False)
    model_version: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    trigger: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)
