import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'submitted', "
            "'approved', 'rejected')",
            name="ck_tasks_status",
        ),
        CheckConstraint("position >= 0", name="ck_tasks_position"),
        Index("ix_tasks_work_order_id_status", "work_order_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    work_order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("work_orders.id"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    instructions: Mapped[str] = mapped_column(Text, nullable=False)
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("locations.id"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        String(30), default="pending", nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # A short phrase the worker says on camera in the After video.
    challenge_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    challenge_issued_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    work_order: Mapped["WorkOrder"] = relationship(back_populates="tasks")
    assignee: Mapped["User | None"] = relationship(foreign_keys=[assigned_to])
    location: Mapped["Location | None"] = relationship(back_populates="tasks")
    requirements: Mapped[list["Requirement"]] = relationship(
        back_populates="task", cascade="all, delete-orphan",
        order_by="Requirement.position"
    )

    @property
    def assigned_to_name(self) -> str | None:
        return self.assignee.full_name if self.assignee else None

    @property
    def assigned_by_name(self) -> str | None:
        creator = self.work_order.creator if self.work_order else None
        return creator.full_name if creator else None

    @property
    def is_self_created(self) -> bool:
        return bool(self.work_order and self.work_order.is_self_created)



