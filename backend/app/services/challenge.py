"""A short phrase the worker says on camera in the After video.

Saying a fresh phrase makes it hard to reuse an old clip. The speech step in
The AI voice check compares what was said with this code.
"""

import secrets
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Task
from app.services.audit import record_event

WORDS = (
    "amber", "anchor", "bridge", "cedar", "copper", "delta", "ember", "falcon",
    "garden", "harbor", "island", "jasper", "lantern", "meadow", "orchard",
    "pebble", "quartz", "river", "summit", "timber", "violet", "willow",
    "yellow", "zephyr",
)


def new_code() -> str:
    """For example "FALCON 417": easy to say, hard to guess."""
    return f"{secrets.choice(WORDS).upper()} {secrets.randbelow(900) + 100}"


def ensure_code(db: Session, task: Task, actor_id: uuid.UUID | None) -> Task:
    """Give the task a code the first time it is asked for. The caller commits."""
    if not task.challenge_code:
        _issue(db, task, actor_id)
    return task


def rotate_code(db: Session, task: Task, actor_id: uuid.UUID | None) -> Task:
    if task.status in {"submitted", "approved"}:
        raise HTTPException(
            status_code=409,
            detail=f"A {task.status} task keeps its code",
        )
    _issue(db, task, actor_id)
    return task


def _issue(db: Session, task: Task, actor_id: uuid.UUID | None) -> None:
    task.challenge_code = new_code()
    task.challenge_issued_at = datetime.now(UTC)
    # The audit trail records that a code was issued, not the code itself.
    record_event(db, actor_id, "task", task.id, "challenge.issued", {})
