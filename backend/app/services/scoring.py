"""Saving and reading AI scores.

A score is advice for the reviewer. It never approves or rejects a task. The
The AI score job calls save_score_set(); this module only stores, bands and
reads the numbers.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Evidence, Task, TaskScore, VerificationRun
from app.schemas.scoring import ItemScore, ScorePart, ScoreSetResponse
from app.services.audit import record_event

STRONG_FROM = 85
CHECK_FROM = 60
INTEGRITY_CAP = 30
UNSCORED_CAP = CHECK_FROM + 24  # 84: an incomplete task is never "strong"


def band_for(score: int | None) -> str:
    if score is None:
        return "not_scored"
    if score >= STRONG_FROM:
        return "strong"
    if score >= CHECK_FROM:
        return "check"
    return "weak"


def clamp_score(value: float | int | None) -> int | None:
    if value is None:
        return None
    return int(round(max(0, min(100, value))))


def save_score_set(
    db: Session,
    task: Task,
    items: list[dict[str, Any]],
    *,
    model_name: str,
    model_version: str,
    trigger: str = "manual",
    actor_id: uuid.UUID | None = None,
    integrity_failed: bool = False,
) -> uuid.UUID:
    """Store one scoring run. The caller commits.

    Each item is {"requirement_id", "score" (0-100 or None), "parts", "reasons"}.
    The task score is the LOWEST item score, so one weak item cannot hide behind
    strong ones. An item that could not be scored caps the task at "check", and
    a failed integrity check caps every score at 30.
    """
    batch = uuid.uuid4()
    now = datetime.now(UTC)
    rows: list[TaskScore] = []
    scores: list[int | None] = []

    def row(requirement_id, score, parts, reasons) -> TaskScore:
        return TaskScore(
            task_id=task.id,
            requirement_id=requirement_id,
            batch_id=batch,
            score=score,
            band=band_for(score),
            parts=parts,
            reasons=reasons,
            model_name=model_name,
            model_version=model_version,
            trigger=trigger,
            created_at=now,
        )

    for item in items:
        score = clamp_score(item.get("score"))
        reasons = [str(text) for text in item.get("reasons") or []]
        if integrity_failed and score is not None and score > INTEGRITY_CAP:
            score = INTEGRITY_CAP
            reasons.append("A file failed the integrity check, so the score is capped.")
        if score is None and not reasons:
            reasons.append("This item could not be scored.")
        parts = [ScorePart(**part).model_dump() for part in item.get("parts") or []]
        rows.append(row(item.get("requirement_id"), score, parts, reasons))
        scores.append(score)

    scored = [value for value in scores if value is not None]
    unscored = len(scores) - len(scored)
    if scored:
        task_score = min(scored)
        task_reasons = ["The task score is its lowest checklist item score."]
        if unscored:
            task_score = min(task_score, UNSCORED_CAP)
            task_reasons.append(
                f"{unscored} item(s) could not be scored, so this task is not rated strong."
            )
    else:
        task_score = None
        task_reasons = ["No checklist item could be scored."]
    rows.append(row(None, task_score, [], task_reasons))

    db.add_all(rows)
    record_event(
        db,
        actor_id,
        "task",
        task.id,
        "score.saved",
        {"score": task_score, "band": band_for(task_score), "trigger": trigger},
    )
    db.flush()
    return batch


def _item(row: TaskScore) -> ItemScore:
    return ItemScore(
        requirement_id=row.requirement_id,
        score=row.score,
        band=row.band,
        parts=[ScorePart(**part) for part in row.parts or []],
        reasons=[str(text) for text in row.reasons or []],
    )


def latest_score_set(db: Session, task: Task) -> ScoreSetResponse:
    newest = db.scalar(
        select(TaskScore)
        .where(TaskScore.task_id == task.id)
        .order_by(TaskScore.created_at.desc(), TaskScore.id)
        .limit(1)
    )
    if newest is None:
        return ScoreSetResponse(task_id=task.id, scored=False)

    rows = list(
        db.scalars(
            select(TaskScore)
            .where(TaskScore.batch_id == newest.batch_id)
            .order_by(TaskScore.created_at, TaskScore.id)
        ).all()
    )
    scored_at = newest.created_at
    if scored_at.tzinfo is None:
        scored_at = scored_at.replace(tzinfo=UTC)
    latest_evidence_at = db.scalar(
        select(Evidence.uploaded_at)
        .where(Evidence.task_id == task.id)
        .order_by(Evidence.uploaded_at.desc())
        .limit(1)
    )
    latest_analysis_at = db.scalar(
        select(VerificationRun.completed_at)
        .join(Evidence, Evidence.id == VerificationRun.evidence_id)
        .where(
            Evidence.task_id == task.id,
            VerificationRun.completed_at.is_not(None),
        )
        .order_by(VerificationRun.completed_at.desc())
        .limit(1)
    )
    source_timestamps = [
        timestamp
        for timestamp in (latest_evidence_at, latest_analysis_at)
        if timestamp is not None
    ]
    stale = any(
        (timestamp.replace(tzinfo=UTC) if timestamp.tzinfo is None else timestamp)
        > scored_at
        for timestamp in source_timestamps
    )
    task_row = next((r for r in rows if r.requirement_id is None), None)
    return ScoreSetResponse(
        task_id=task.id,
        scored=bool(task_row and task_row.score is not None),
        stale=stale,
        created_at=newest.created_at,
        model_name=newest.model_name,
        model_version=newest.model_version,
        task=_item(task_row) if task_row else None,
        items=[_item(r) for r in rows if r.requirement_id is not None],
    )
