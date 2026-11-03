import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text, false
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class WorkOrder(TimestampMixin, Base):
    __tablename__ = "work_orders"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'open', 'in_progress', 'submitted', "
            "'under_review', 'approved', 'rejected', 'cancelled')",
            name="ck_work_orders_status",
        ),
        Index("ix_work_orders_created_by_status", "created_by", "status"),
        Index("ix_work_orders_assigned_to_status", "assigned_to", "status"),
        Index("ix_work_orders_due_at", "due_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(30), default="draft", nullable=False, index=True
    )
    due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True, index=True
    )
    # True when a worker created this work for themselves.
    is_self_created: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )

    tasks: Mapped[list["Task"]] = relationship(
        back_populates="work_order",
        cascade="all, delete-orphan",
    )

    project: Mapped["Project | None"] = relationship(
        "Project", back_populates="work_orders"
    )
    creator: Mapped["User"] = relationship(
        "User",
        foreign_keys=[created_by],
        back_populates="created_work_orders",
    )
    assignee: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[assigned_to],
        back_populates="assigned_work_orders",
    )

    @property
    def created_by_name(self) -> str | None:
        return self.creator.full_name if self.creator else None

    @property
    def assigned_to_name(self) -> str | None:
        return self.assignee.full_name if self.assignee else None
    