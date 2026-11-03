import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger, CheckConstraint, DateTime, ForeignKey, JSON, String, func
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Evidence(TimestampMixin, Base):
    __tablename__ = "evidence"
    __table_args__ = (
        CheckConstraint(
            "media_type IN ('image', 'video')",
            name="ck_evidence_media_type",
        ),
        CheckConstraint(
            "integrity_status IN ('pending', 'passed', 'flagged', 'failed')",
            name="ck_evidence_integrity_status",
        ),
        CheckConstraint("size_bytes >= 0", name="ck_evidence_size"),
        CheckConstraint(
            "phase IN ('before', 'after', 'other')",
            name="ck_evidence_phase",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id"), index=True, nullable=False
    )
    requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("requirements.id"), index=True, nullable=True
    )
    submitted_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    media_type: Mapped[str] = mapped_column(String(10), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(150), nullable=False)
    media_metadata: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    perceptual_hash: Mapped[str | None] = mapped_column(
        String(16), nullable=True, index=True
    )
    captured_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    integrity_status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False
    )
    # "before" or "after" the work, or "other" for a single, unpaired file.
    phase: Mapped[str] = mapped_column(
        String(10), default="other", server_default="other", nullable=False
    )
