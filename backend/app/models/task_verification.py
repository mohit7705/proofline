import uuid
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class TaskVerification(TimestampMixin, Base):
    """One combined verification result for a task (advice, not a decision)."""

    __tablename__ = "task_verifications"
    __table_args__ = (
        CheckConstraint(
            "decision IN ('VERIFIED', 'NEEDS_MORE_EVIDENCE', "
            "'FAILED_INSPECTION', 'NEEDS_HUMAN_REVIEW')",
            name="ck_task_verifications_decision",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id"), index=True, nullable=False
    )
    decision: Mapped[str] = mapped_column(String(30), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    trigger: Mapped[str] = mapped_column(
        String(20), default="view", nullable=False
    )
    result: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, nullable=False
    )
