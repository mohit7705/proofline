import uuid

from sqlalchemy import (
    Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text, JSON, false
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Requirement(TimestampMixin, Base):
    __tablename__ = "requirements"
    __table_args__ = (
        CheckConstraint(
            "response_type IN ('boolean', 'text', 'number', 'photo', 'video')",
            name="ck_requirements_response_type",
        ),
        CheckConstraint("position >= 0", name="ck_requirements_position"),
        CheckConstraint(
            "minimum_evidence_count >= 0",
            name="ck_requirements_min_evidence",
        ),
        CheckConstraint(
            "maximum_evidence_count >= minimum_evidence_count",
            name="ck_requirements_evidence_count_range",
        ),
        Index("ix_requirements_task_position", "task_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    instructions: Mapped[str] = mapped_column(Text, nullable=False)
    response_type: Mapped[str] = mapped_column(
        String(20), default="boolean", nullable=False
    )
    is_required: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    minimum_evidence_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    maximum_evidence_count: Mapped[int] = mapped_column(
        Integer, default=10, nullable=False
    )
    required_viewpoints: Mapped[list] = mapped_column(
        JSON, default=list, nullable=False
    )
    requires_human_inspection: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    # When true the item needs a Before file and an After file.
    requires_before_after: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )
    # When true the item needs a Before file and an After file.
    task: Mapped["Task"] = relationship(back_populates="requirements")
