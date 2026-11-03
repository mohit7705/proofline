"""Combine evidence facts and saved video analysis into task-level advice."""

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    Evidence, Requirement, Task, TaskScore, TaskVerification, VerificationRun
)
from app.schemas.verification import (
    FollowUp,
    IntegritySignal,
    RequirementResult,
    VerificationBody,
    VerificationResponse,
)
from app.services.audit import record_event
from app.services.evidence_phases import gap_text, phase_gaps
from app.services.evidence_integrity import (
    find_exact_duplicates,
    find_perceptual_duplicates,
)
from app.services.requirements import list_requirements
from app.services.score_signals import score_signals

logger = logging.getLogger(__name__)

CHUNK_SIZE = 64 * 1024
RELEVANT = {"relevant", "potentially_relevant"}


def _aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def check_stored_file(evidence: Evidence) -> bool:
    """True when the stored file still matches the hash saved at upload."""
    storage_dir = Path(
        os.environ.get("EVIDENCE_STORAGE_DIR", "/var/lib/proofline/evidence")
    ).resolve()
    if not evidence.storage_key or not evidence.sha256_hash:
        return False
    path = (storage_dir / evidence.storage_key).resolve()
    if path.parent != storage_dir or not path.is_file():
        return False
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stored:
            while chunk := stored.read(CHUNK_SIZE):
                digest.update(chunk)
    except OSError:
        return False
    return digest.hexdigest() == evidence.sha256_hash


def _latest_runs(
    db: Session, evidence_ids: list[uuid.UUID]
) -> dict[uuid.UUID, VerificationRun]:
    if not evidence_ids:
        return {}
    rows = db.scalars(
        select(VerificationRun)
        .where(VerificationRun.evidence_id.in_(evidence_ids))
        .order_by(
            VerificationRun.started_at.desc(), VerificationRun.created_at.desc()
        )
    ).all()
    latest: dict[uuid.UUID, VerificationRun] = {}
    for run in rows:
        latest.setdefault(run.evidence_id, run)
    return latest


def _file_signals(db: Session, evidence: Evidence) -> list[IntegritySignal]:
    """Integrity and duplicate signals for one file."""
    signals: list[IntegritySignal] = []

    if not check_stored_file(evidence):
        evidence.integrity_status = "failed"
        signals.append(
            IntegritySignal(
                label="Integrity check failed",
                detail=(
                    "The stored file is missing or no longer matches the hash "
                    "saved at upload."
                ),
                severity="critical",
                evidence_id=evidence.id,
            )
        )
        return signals

    if evidence.integrity_status == "failed":
        signals.append(
            IntegritySignal(
                label="Integrity check failed earlier",
                detail=(
                    "This file failed an integrity check before and stays "
                    "marked as failed."
                ),
                severity="critical",
                evidence_id=evidence.id,
            )
        )
        return signals

    if evidence.integrity_status == "pending":
        evidence.integrity_status = "passed"

    duplicates = find_exact_duplicates(db, evidence)
    if duplicates:
        signals.append(
            IntegritySignal(
                label="Duplicate file",
                detail=(
                    f"The same file appears {len(duplicates)} more time(s) "
                    "in this work order."
                ),
                severity="warning",
                evidence_id=evidence.id,
            )
        )

    similar = [
        (other, distance)
        for other, distance in find_perceptual_duplicates(db, evidence)
        if other.task_id != evidence.task_id
        and other.sha256_hash != evidence.sha256_hash
    ]
    if similar:
        signals.append(
            IntegritySignal(
                label="Very similar photo",
                detail=(
                    f"Looks almost the same as {len(similar)} photo(s) "
                    "from other tasks."
                ),
                severity="warning",
                evidence_id=evidence.id,
            )
        )

    if signals and evidence.integrity_status == "passed":
        evidence.integrity_status = "flagged"
    elif evidence.integrity_status == "flagged" and not signals:
        signals.append(
            IntegritySignal(
                label="Flagged evidence",
                detail="This file was flagged earlier and needs a person to look at it.",
                severity="warning",
                evidence_id=evidence.id,
            )
        )
    return signals


def _video_findings(
    evidence: Evidence,
    run: VerificationRun | None,
    min_confidence: float,
) -> tuple[list[IntegritySignal], bool, list[float]]:
    """Signals, whether no relevant content was found, and relevant timestamps."""

    def warn(label: str, detail: str) -> IntegritySignal:
        return IntegritySignal(
            label=label, detail=detail, severity="warning", evidence_id=evidence.id
        )

    if run is None:
        return [warn("Video not analysed", "Run the video analysis for this file.")], False, []

    findings = run.findings or {}
    if run.status != "completed":
        code = findings.get("error_code") or run.status
        return [warn("Video analysis did not finish", f"Status: {code}.")], False, []

    signals: list[IntegritySignal] = []
    if run.confidence is None or run.confidence < min_confidence:
        shown = "none" if run.confidence is None else f"{run.confidence:.2f}"
        signals.append(
            warn(
                "Low AI confidence",
                f"Confidence {shown}, below {min_confidence:.2f}.",
            )
        )
    for flag in findings.get("flags") or []:
        signals.append(warn("Model flag", str(flag)))

    observations = findings.get("observations") or []
    relevant = [item for item in observations if item.get("relevance") in RELEVANT]
    irrelevant = bool(observations) and all(
        item.get("relevance") == "not_relevant" for item in observations
    )
    if irrelevant:
        signals.append(
            warn("No relevant content", "The video does not show what was asked for.")
        )
    elif not relevant:
        signals.append(
            warn("Content unclear", "The AI could not clearly see the requested work.")
        )

    stamps = sorted(
        {
            round(float(item["timestamp_seconds"]), 2)
            for item in relevant
            if isinstance(item.get("timestamp_seconds"), (int, float))
        }
    )
    return signals, irrelevant, stamps


def _needed(requirement: Requirement) -> int:
    if requirement.minimum_evidence_count:
        return requirement.minimum_evidence_count
    if requirement.is_required and requirement.response_type in {"photo", "video"}:
        return 1
    return 0


def _judge(
    requirement: Requirement,
    evidence: list[Evidence],
    signals: dict[uuid.UUID, list[IntegritySignal]],
    irrelevant: set[uuid.UUID],
    stamps: dict[uuid.UUID, list[float]],
) -> RequirementResult:
    usable = [item for item in evidence if item.id not in irrelevant]
    related = [signal for item in usable for signal in signals.get(item.id, [])]
    needed = _needed(requirement)
    ids = [item.id for item in usable]
    times = sorted({stamp for item in usable for stamp in stamps.get(item.id, [])})

    def result(decision: str, explanation: str) -> RequirementResult:
        return RequirementResult(
            requirement_id=requirement.id,
            decision=decision,
            explanation=explanation,
            evidence_ids=ids,
            timestamps_seconds=times,
        )

    if not requirement.is_required and not evidence:
        return result("VERIFIED", "Optional item. Nothing was submitted.")

    if any(signal.severity == "critical" for signal in related):
        return result("FAILED_INSPECTION", "A file failed the integrity check.")

    if requirement.requires_before_after:
        gaps = phase_gaps(usable)
        if gaps:
            return result("NEEDS_MORE_EVIDENCE", f"Add {gap_text(gaps)}.")

    if len(usable) < needed:
        text = f"{len(usable)} of {needed} required evidence items are usable."
        if len(usable) < len(evidence):
            text += " Some videos did not show the requested work."
        return result("NEEDS_MORE_EVIDENCE", text)

    reasons = sorted(
        {signal.label for signal in related if signal.severity == "warning"}
    )
    if requirement.requires_human_inspection:
        reasons.insert(0, "This item must be checked by a manager")
    if reasons:
        return result("NEEDS_HUMAN_REVIEW", "; ".join(reasons) + ".")

    text = "No evidence is required." if not usable else (
        f"{len(usable)} evidence item(s) passed the integrity and AI checks."
    )
    if any(item.media_type == "image" for item in usable):
        text += (
            " Photos are checked for integrity and duplicates only; an "
            "manager judges what they show."
        )
    return result("VERIFIED", text)


def _follow_up(
    requirements: dict[uuid.UUID, Requirement],
    results: list[RequirementResult],
    attempts_left: int,
) -> FollowUp:
    lines = []
    for item in results:
        if item.decision != "NEEDS_MORE_EVIDENCE":
            continue
        requirement = requirements[item.requirement_id]
        line = f'"{requirement.title}": {item.explanation}'
        viewpoints = [value for value in (requirement.required_viewpoints or []) if value]
        if viewpoints:
            line += f" Show: {', '.join(viewpoints)}."
        lines.append(line)
    instruction = " ".join(lines) or "Add the missing evidence and submit again."
    return FollowUp(instruction=instruction, attempts_left=attempts_left)


def _previous_attempts(db: Session, task: Task) -> int:
    return len(
        db.scalars(
            select(TaskVerification.id).where(
                TaskVerification.task_id == task.id,
                TaskVerification.trigger == "submit",
                TaskVerification.decision == "NEEDS_MORE_EVIDENCE",
            )
        ).all()
    )


def evaluate_task(db: Session, task: Task, trigger: str) -> VerificationBody:
    settings = get_settings()
    requirements = list_requirements(db, task.id)
    requirements_by_id = {item.id: item for item in requirements}
    evidence = list(
        db.scalars(
            select(Evidence)
            .where(Evidence.task_id == task.id)
            .order_by(Evidence.uploaded_at, Evidence.id)
        ).all()
    )
    runs = _latest_runs(
        db, [item.id for item in evidence if item.media_type == "video"]
    )

    signals: dict[uuid.UUID, list[IntegritySignal]] = {}
    irrelevant: set[uuid.UUID] = set()
    stamps: dict[uuid.UUID, list[float]] = {}
    for item in evidence:
        found = _file_signals(db, item)
        if item.media_type == "video" and not any(
            signal.severity == "critical" for signal in found
        ):
            more, nothing_relevant, timestamps = _video_findings(
                item, runs.get(item.id), settings.verification_min_confidence
            )
            found += more
            if nothing_relevant:
                irrelevant.add(item.id)
            stamps[item.id] = timestamps
        signals[item.id] = found

    results = [
        _judge(
            requirement,
            [item for item in evidence if item.requirement_id == requirement.id],
            signals,
            irrelevant,
            stamps,
        )
        for requirement in requirements
    ]

    loose = [item for item in evidence if item.requirement_id is None]
    loose_signals = [signal for item in loose for signal in signals[item.id]]
    decisions = {item.decision for item in results}
    if any(signal.severity == "critical" for signal in loose_signals):
        decisions.add("FAILED_INSPECTION")
    if any(signal.severity == "warning" for signal in loose_signals):
        decisions.add("NEEDS_HUMAN_REVIEW")
    if not evidence:
        decisions.add("NEEDS_MORE_EVIDENCE")

    for decision in (
        "FAILED_INSPECTION",
        "NEEDS_MORE_EVIDENCE",
        "NEEDS_HUMAN_REVIEW",
    ):
        if decision in decisions:
            final = decision
            break
    else:
        final = "VERIFIED"

    used = _previous_attempts(db, task) + (1 if trigger == "submit" else 0)
    attempts_left = max(0, settings.verification_max_follow_ups - used)
    all_signals = [signal for item in evidence for signal in signals[item.id]]
    # The AI score is advice. It may send an otherwise clean result to a person.
    extra = score_signals(db, task)
    all_signals.extend(extra)
    if final == "VERIFIED" and any(signal.severity == "warning" for signal in extra):
        final = "NEEDS_HUMAN_REVIEW"

    follow_up = None
    if final == "NEEDS_MORE_EVIDENCE":
        if attempts_left == 0 and used >= settings.verification_max_follow_ups:
            final = "NEEDS_HUMAN_REVIEW"
            all_signals.append(
                IntegritySignal(
                    label="Follow-up attempts used",
                    detail=(
                        "The worker has used every follow-up attempt. "
                        "A person must decide."
                    ),
                    severity="info",
                )
            )
        else:
            follow_up = _follow_up(requirements_by_id, results, attempts_left)
            if not evidence:
                follow_up.instruction = (
                    "No evidence has been submitted yet. "
                    + follow_up.instruction
                )

    verified = sum(1 for item in results if item.decision == "VERIFIED")
    headline = {
        "VERIFIED": "No problems found.",
        "NEEDS_MORE_EVIDENCE": "More evidence is needed.",
        "FAILED_INSPECTION": "An evidence file failed the integrity check.",
        "NEEDS_HUMAN_REVIEW": "A person must look at this task.",
    }[final]
    summary = (
        f"{verified} of {len(results)} checklist items verified. {headline} "
        "This is advice; a manager makes the decision."
    )

    return VerificationBody(
        decision=final,
        summary=summary,
        requirement_results=results,
        integrity_signals=all_signals,
        follow_up=follow_up,
    )


def run_verification(
    db: Session,
    task: Task,
    actor_id: uuid.UUID | None,
    trigger: str,
) -> TaskVerification:
    """Evaluate the task and store the result. The caller commits."""
    body = evaluate_task(db, task, trigger)
    row = TaskVerification(
        task_id=task.id,
        decision=body.decision,
        summary=body.summary,
        trigger=trigger,
        result=body.model_dump(mode="json"),
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.flush()
    if trigger in {"submit", "manual"}:
        record_event(
            db,
            actor_id,
            "task",
            task.id,
            "verification.completed",
            {"decision": body.decision, "trigger": trigger},
        )
    return row


def latest_verification(db: Session, task: Task) -> TaskVerification | None:
    return db.scalar(
        select(TaskVerification)
        .where(TaskVerification.task_id == task.id)
        .order_by(TaskVerification.created_at.desc(), TaskVerification.id)
        .limit(1)
    )


def is_stale(db: Session, task: Task, row: TaskVerification) -> bool:
    """True when evidence or AI results changed after the stored result."""
    created = _aware(row.created_at)
    evidence = db.scalars(select(Evidence).where(Evidence.task_id == task.id)).all()
    if any(_aware(item.uploaded_at) > created for item in evidence):
        return True
    stamps = db.scalars(
        select(TaskScore.created_at).where(TaskScore.task_id == task.id)
    ).all()
    if any(_aware(stamp) > created for stamp in stamps):
        return True
    ids = [item.id for item in evidence]
    if not ids:
        return False
    runs = db.scalars(
        select(VerificationRun).where(VerificationRun.evidence_id.in_(ids))
    ).all()
    return any(
        _aware(run.completed_at) and _aware(run.completed_at) > created
        for run in runs
    )


def to_response(row: TaskVerification) -> VerificationResponse:
    return VerificationResponse(
        task_id=row.task_id,
        created_at=row.created_at,
        **row.result,
    )
