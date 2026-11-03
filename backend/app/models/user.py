import uuid

from sqlalchemy import Boolean, CheckConstraint, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('manager', 'worker')",
            name="ck_users_role",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(320), unique=True, index=True, nullable=False
    )
    password_hash: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    google_sub: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    created_work_orders: Mapped[list["WorkOrder"]] = relationship(
        "WorkOrder",
        foreign_keys="WorkOrder.created_by",
        back_populates="creator",
    )
    assigned_work_orders: Mapped[list["WorkOrder"]] = relationship(
        "WorkOrder",
        foreign_keys="WorkOrder.assigned_to",
        back_populates="assignee",
    )
