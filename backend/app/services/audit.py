import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditEvent


def record_event(
    db: Session,
    actor_id: uuid.UUID | None,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    """Add an audit event to the current transaction.

    The caller commits, so the event is saved together with the change it
    describes: both are stored, or neither is. Audit events are never
    updated or deleted.
    """
    event = AuditEvent(
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        details=details or {},
        created_at=datetime.now(UTC),
    )
    db.add(event)
    return event
