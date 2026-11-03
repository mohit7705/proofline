import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class EvidenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    requirement_id: uuid.UUID | None = None
    submitted_by: uuid.UUID
    media_type: str
    original_filename: str
    content_type: str
    size_bytes: int
    sha256_hash: str | None
    media_metadata: dict[str, Any] | None = None
    captured_at: datetime | None
    uploaded_at: datetime
    integrity_status: str
    phase: str = "other"
