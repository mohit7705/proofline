"""Runs one AI score for a task.

For every checklist item that needs a Before and an After file:
  Muse Spark compares the two, SAM 3.1 outlines the part in both, and Muse
  Voice Transcribe listens for the spoken challenge code in an After video.
Other items are judged by the evidence rules alone. The numbers are built in
score_parts and stored by scoring.save_score_set. A score is advice only.
"""

import dataclasses
import logging
import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.client import MetaAIClient
from app.core.config import get_settings
from app.models import Evidence, Requirement, ScoreJob, Task, User, VerificationRun
from app.schemas.video_analysis import VideoAnalysisResult
from app.services.audit import record_event
from app.services.evidence_phases import gap_text, phase_gaps
from app.services.evidence_video import EvidenceVideoError, extract_authorized_evidence_frames
from app.services.requirements import list_requirements
from app.services.score_ai import (
    ScoreAIError,
    build_prompt,
    compare_before_after,
    outline_part,
    spoken_text,
)
from app.services.score_parts import (
    code_matches,
    item_score,
    make_part,
    part_match,
    rules_check,
    vision_score,
)
from app.services.scoring import save_score_set
from app.services.verification_engine import _aware, _file_signals, _needed, check_stored_file
from app.services.video_frames import ExtractedFrame

logger = logging.getLogger(__name__)

STUCK_AFTER = timedelta(minutes=10)
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
SPEECH_MODEL = "muse-voice-transcribe-1.0"
SEGMENT_MODEL = "sam-3.1"


# ---------- who may start a run, and when ----------

def ensure_can_start(db: Session, task: Task, user: User) -> None:
    settings = get_settings()
    if not settings.model_mock and not settings.model_api_key:
        raise HTTPException(status_code=503, detail="AI isn't set up on this server (no model key)")
    if task.status == "approved":
        raise HTTPException(status_code=409, detail="An approved task is final and is not scored again")
    if not list_requirements(db, task.id):
        raise HTTPException(status_code=422, detail="Add a checklist item before running the AI score")
    has_files = db.scalar(select(Evidence.id).where(Evidence.task_id == task.id).limit(1))
    if has_files is None:
        raise HTTPException(status_code=422, detail="Upload at least one file before running the AI score")

    latest = latest_job(db, task.id)
    if latest is not None and latest.status in {"queued", "processing"}:
        started = _aware(latest.started_at or latest.created_at)
        if started is not None and datetime.now(UTC) - started < STUCK_AFTER:
            raise HTTPException(status_code=409, detail="An AI score is already running for this task")

    if user.role == "worker":
        since = datetime.now(UTC) - timedelta(hours=1)
        used = db.scalar(
            select(func.count(ScoreJob.id)).where(
                ScoreJob.started_by == user.id, ScoreJob.created_at >= since
            )
        )
        if (used or 0) >= settings.worker_analysis_per_hour:
            raise HTTPException(
                status_code=429,
                detail="You have used your AI score runs for this hour. Try again later.",
                headers={"Retry-After": "600"},
            )


def latest_job(db: Session, task_id: uuid.UUID) -> ScoreJob | None:
    return db.scalar(
        select(ScoreJob)
        .where(ScoreJob.task_id == task_id)
        .order_by(ScoreJob.created_at.desc(), ScoreJob.id)
        .limit(1)
    )


def latest_finished_job(db: Session, task_id: uuid.UUID) -> ScoreJob | None:
    return db.scalar(
        select(ScoreJob)
        .where(ScoreJob.task_id == task_id, ScoreJob.status.in_(["completed", "failed"]))
        .order_by(ScoreJob.created_at.desc(), ScoreJob.id)
        .limit(1)
    )


def queue_job(db: Session, task: Task, user: User) -> ScoreJob:
    job = ScoreJob(
        task_id=task.id, started_by=user.id, status="queued", findings={},
        created_at=datetime.now(UTC),
    )
    db.add(job)
    db.flush()
    record_event(db, user.id, "task", task.id, "score.requested", {"job_id": str(job.id)})
    db.commit()
    db.refresh(job)
    return job


# ---------- files and frames ----------

def _storage_path(evidence: Evidence) -> Path | None:
    folder = Path(os.environ.get("EVIDENCE_STORAGE_DIR", "/var/lib/proofline/evidence")).resolve()
    if not evidence.storage_key:
        return None
    path = (folder / evidence.storage_key).resolve()
    return path if path.parent == folder and path.is_file() else None


def _pick_timestamps(duration: float, count: int) -> list[float]:
    end = max(0.0, duration - 0.1)
    if count <= 1 or end == 0:
        return [0.0]
    return sorted({round(end * i / (count - 1), 3) for i in range(count)})


def _load_frames(
    db: Session, user: User, evidence: Evidence, prefix: str, count: int
) -> tuple[list[ExtractedFrame], float | None]:
    """Frames of one file: a photo is one frame, a video is a few sampled frames."""
    if evidence.media_type == "image":
        if evidence.content_type not in IMAGE_TYPES:
            raise EvidenceVideoError("frame_extraction_failed", "Unsupported image type.")
        if not check_stored_file(evidence):
            evidence.integrity_status = "failed"
            db.commit()
            raise EvidenceVideoError("integrity_check_failed", "Evidence integrity verification failed.")
        path = _storage_path(evidence)
        if path is None:
            raise EvidenceVideoError("file_unavailable", "Stored evidence file is unavailable.")
        frame = ExtractedFrame(f"{prefix}-photo", 0.0, path.read_bytes(), evidence.content_type)
        return [frame], None

    metadata = evidence.media_metadata if isinstance(evidence.media_metadata, dict) else {}
    duration = metadata.get("duration_seconds")
    if isinstance(duration, bool) or not isinstance(duration, (int, float)) or duration <= 0:
        raise EvidenceVideoError("invalid_metadata", "Video duration is unavailable.")
    frames = extract_authorized_evidence_frames(db, evidence.id, user, _pick_timestamps(float(duration), count))
    return [dataclasses.replace(f, frame_id=f"{prefix}-{f.frame_id}") for f in frames], float(duration)


def _latest(files: list[Evidence], phase: str) -> Evidence | None:
    mine = [f for f in files if f.phase == phase]
    return mine[-1] if mine else None  # files are oldest first


def _brief(evidence: Evidence) -> dict[str, Any]:
    return {"evidence_id": str(evidence.id), "filename": evidence.original_filename, "media_type": evidence.media_type}


def _save_video_run(
    db: Session, evidence: Evidence, phase: str, answer: dict[str, Any],
    frames: list[ExtractedFrame], duration: float,
) -> None:
    """Store the comparison as a normal analysis of this video, so the existing
    checks and the reviewer's "AI frame analysis" card use it as well."""
    settings = get_settings()
    stamps = {f.frame_id: f.timestamp_seconds for f in frames}
    trusted = answer["same_scene"] and (phase == "before" or answer["work_visible_after"])
    observations = [
        {
            "observation_id": f"obs-{n + 1:03d}",
            "timestamp_seconds": min(stamps[o["frame_id"]], duration),
            "observation": o["observation"],
            "relevance": "relevant" if trusted else "uncertain",
            "supporting_frame_ids": [o["frame_id"]],
            "limitations": ["Compared with the other file of the pair, using sampled frames only."],
        }
        for n, o in enumerate(x for x in answer["observations"] if x["phase"] == phase and x["frame_id"] in stamps)
    ]
    result = VideoAnalysisResult(
        status="completed",
        observations=observations,
        confidence=answer["confidence"],
        flags=answer["flags"],
        coverage={
            "video_duration_seconds": duration,
            "sampled_timestamps_seconds": sorted({f.timestamp_seconds for f in frames}),
            "sampling_strategy": "uniform",
        },
    )
    now = datetime.now(UTC)
    db.add(
        VerificationRun(
            evidence_id=evidence.id,
            model_name=settings.video_analysis_model,
            model_version="before-after-compare",
            status="completed",
            findings=result.model_dump(mode="json"),
            confidence=result.confidence,
            started_at=now,
            completed_at=now,
        )
    )


# ---------- one checklist item ----------

async def _score_item(
    db: Session, user: User, task: Task, requirement: Requirement,
    files: list[Evidence], client: MetaAIClient,
) -> tuple[dict[str, Any], dict[str, Any], bool, str | None]:
    """Returns (item for save_score_set, detail for the screen, integrity failed, AI error code)."""
    settings = get_settings()
    paired = requirement.requires_before_after
    detail: dict[str, Any] = {
        "requirement_id": str(requirement.id),
        "title": requirement.title,
        "mode": "before_after" if paired else "rules_only",
        "status": "not_scored",
        "before": None, "after": None,
        "change_summary": None, "target_part": None,
        "observations": [], "flags": [], "retake_request": None,
        "outlines": None, "code": None,
    }
    reasons: list[str] = []

    duplicates = similar = 0
    critical = False
    for evidence in files:
        for signal in _file_signals(db, evidence):
            if signal.severity == "critical":
                critical = True
            elif signal.label == "Duplicate file":
                duplicates = 1  # A matching pair counts as one duplicate signal.
            elif signal.label == "Very similar photo":
                similar = 1  # Avoid charging both sides of the same pair twice.
    rules_value, rules_detail, rules_reasons = rules_check(
        len(files), _needed(requirement), duplicates, similar, critical
    )
    parts = [make_part("rules", rules_value, rules_detail)]
    ai_error: str | None = None

    def finish(score: int | None, extra: list[str]) -> tuple[dict[str, Any], dict[str, Any], bool, str | None]:
        all_reasons = reasons + extra
        detail["status"] = "scored" if score is not None else "not_scored"
        item = {"requirement_id": requirement.id, "score": score, "parts": parts, "reasons": all_reasons}
        return item, detail, critical, ai_error

    if not paired:
        score, extra = item_score(parts, needs_ai=False)
        reasons.extend(rules_reasons)
        return finish(0 if critical else score, extra)

    before, after = _latest(files, "before"), _latest(files, "after")
    detail["before"] = _brief(before) if before else None
    detail["after"] = _brief(after) if after else None
    if critical:
        reasons.extend(rules_reasons)
        return finish(0, [])
    gaps = phase_gaps(files)
    if gaps or before is None or after is None:
        text = f"Add {gap_text(gaps)}."
        detail["retake_request"] = text
        return finish(None, [text])

    try:
        count = settings.score_frames_per_video
        before_frames, before_len = _load_frames(db, user, before, "before", count)
        after_frames, after_len = _load_frames(db, user, after, "after", count)
        manifest = [
            {"frame_id": f.frame_id, "phase": phase, "timestamp_seconds": f.timestamp_seconds}
            for phase, group in (("before", before_frames), ("after", after_frames))
            for f in group
        ]
        prompt = build_prompt(
            task.instructions or task.title,
            requirement.title,
            requirement.instructions,
            [v for v in (requirement.required_viewpoints or []) if v],
            manifest,
        )
        answer = await compare_before_after(client, prompt, before_frames + after_frames)
    except EvidenceVideoError as exc:
        ai_error = "integrity_failed" if "integrity" in exc.code else "video_decode_failed"
        reasons.append(
            "A file failed the integrity check." if ai_error == "integrity_failed"
            else "A file could not be read for the AI comparison."
        )
        return finish(None, [])
    except ScoreAIError as exc:
        ai_error = exc.code
        reasons.append(
            "The AI service timed out. Run the score again." if exc.code == "model_timeout"
            else "The AI answer could not be used. Run the score again."
        )
        return finish(None, [])

    vision, vision_reasons = vision_score(answer)
    parts.insert(0, make_part("vision", vision, answer["change_summary"] or "Before and After were compared."))
    reasons.extend(vision_reasons)
    detail.update(
        change_summary=answer["change_summary"], target_part=answer["target_part"],
        flags=answer["flags"], retake_request=answer["retake_request"],
        observations=[
            {**o, "timestamp_seconds": next((f.timestamp_seconds for f in before_frames + after_frames if f.frame_id == o["frame_id"]), None)}
            for o in answer["observations"]
        ],
    )

    # SAM 3.1: is it the same part in both files? (the middle frame of each)
    part_name = answer["target_part"] or requirement.title
    b_frame, a_frame = before_frames[len(before_frames) // 2], after_frames[len(after_frames) // 2]
    b_boxes = await outline_part(client, b_frame, part_name)
    a_boxes = await outline_part(client, a_frame, part_name)
    match_score, match_text = part_match(b_boxes, a_boxes)
    parts.insert(1, make_part("part", match_score, match_text))
    detail["outlines"] = {
        "part": part_name,
        "before": {"frame_id": b_frame.frame_id, "timestamp_seconds": b_frame.timestamp_seconds, "boxes": b_boxes},
        "after": {"frame_id": a_frame.frame_id, "timestamp_seconds": a_frame.timestamp_seconds, "boxes": a_boxes},
    }
    if match_score is not None and match_score < 60:
        reasons.append(match_text)

    # Muse Voice Transcribe: was the challenge code said in the After video?
    if after.media_type == "video":
        code_part, code_detail = await _check_code(task, requirement, after, user)
        parts.insert(2, code_part)
        detail["code"] = code_detail
        if code_part["score"] == 0:
            reasons.append("The challenge code was not heard in the After video.")
        elif code_part["score"] is None:
            reasons.append(code_detail["note"])

    reasons.extend(rules_reasons)
    if answer["retake_request"]:
        reasons.append("Retake: " + answer["retake_request"])

    for evidence, phase, frames, length in (
        (before, "before", before_frames, before_len),
        (after, "after", after_frames, after_len),
    ):
        if evidence.media_type == "video" and length:
            _save_video_run(db, evidence, phase, answer, frames, length)

    score, extra = item_score(parts, needs_ai=True)
    return finish(score, extra)


async def _check_code(
    task: Task, requirement: Requirement, after: Evidence, user: User
) -> tuple[dict[str, Any], dict[str, Any]]:
    """The "Spoken challenge code" part, and what to show about it."""
    info: dict[str, Any] = {"heard": None, "transcript": None, "note": "", "model": SPEECH_MODEL}
    settings = get_settings()
    if not task.challenge_code:
        info["note"] = "No challenge code was issued for this task."
        return make_part("code", None, info["note"]), info
    issued = _aware(task.challenge_issued_at)
    uploaded = _aware(after.uploaded_at)
    if issued and uploaded and issued > uploaded + timedelta(seconds=2):
        info["note"] = "The code was issued after this video was uploaded, so it cannot be checked."
        return make_part("code", None, info["note"]), info

    if settings.model_mock:
        # Demo mode: the speech step is simulated. Add "[mock:nocode]" to the
        # checklist text to see the "code not heard" case.
        silent = "[mock:nocode]" in f"{requirement.instructions or ''} {task.instructions or ''}"
        transcript = "Mock transcript: I checked the part." if silent else f"Mock transcript: {task.challenge_code.lower()}"
        info["model"] = "mock"
        note = "Mock mode: the spoken code is simulated."
    else:
        path = _storage_path(after)
        transcript, note = (None, "The After video file is unavailable.") if path is None else await spoken_text(
            path, settings.score_audio_seconds
        )

    if transcript is None:
        info["note"] = note
        return make_part("code", None, note), info
    info["transcript"] = transcript[:500]
    info["heard"] = bool(transcript.strip()) and code_matches(transcript, task.challenge_code)
    info["note"] = note
    text = "The challenge code was heard." if info["heard"] else (note or "The challenge code was not heard.")
    return make_part("code", 100 if info["heard"] else 0, text), info


# ---------- the whole run ----------

def _finish(db: Session, job: ScoreJob, status: str, error: str | None, findings: dict[str, Any]) -> None:
    job.status = status
    job.error_code = error
    job.findings = findings
    job.completed_at = datetime.now(UTC)
    db.commit()


async def run_score_job(
    db: Session, job_id: uuid.UUID, user_id: uuid.UUID, client: MetaAIClient | None = None
) -> None:
    job = db.get(ScoreJob, job_id)
    user = db.get(User, user_id)
    if job is None or user is None:
        return
    task = db.get(Task, job.task_id)
    if task is None:
        _finish(db, job, "failed", "analysis_failed", {})
        return
    job.status = "processing"
    job.started_at = datetime.now(UTC)
    db.commit()

    settings = get_settings()
    owns = client is None
    try:
        client = client or MetaAIClient()
    except RuntimeError:
        _finish(db, job, "failed", "ai_not_configured", {})
        return

    try:
        evidence = list(
            db.scalars(
                select(Evidence).where(Evidence.task_id == task.id).order_by(Evidence.uploaded_at, Evidence.id)
            ).all()
        )
        items: list[dict[str, Any]] = []
        details: list[dict[str, Any]] = []
        any_integrity = False
        first_error: str | None = None
        for requirement in list_requirements(db, task.id):
            files = [e for e in evidence if e.requirement_id == requirement.id]
            item, detail, failed, error = await _score_item(db, user, task, requirement, files, client)
            items.append(item)
            details.append(detail)
            any_integrity = any_integrity or failed
            first_error = first_error or error

        name = (
            "mock (sample answers)" if settings.model_mock
            else f"{settings.video_analysis_model} + {SEGMENT_MODEL} + {SPEECH_MODEL}"
        )
        save_score_set(
            db, task, items,
            model_name=name, model_version="v2", trigger="manual",
            actor_id=user.id, integrity_failed=any_integrity,
        )
        notes = [d["retake_request"] for d in details if d.get("retake_request")]
        findings = {"mock": settings.model_mock, "items": details, "retake_notes": notes}
        scored = any(i["score"] is not None for i in items)
        _finish(db, job, "completed" if scored else "failed", None if scored else (first_error or "analysis_failed"), findings)
    except Exception:  # noqa: BLE001 - the run must always end in a saved state
        logger.exception("AI score failed for task %s", job.task_id)
        db.rollback()
        job = db.get(ScoreJob, job_id)
        if job is not None:
            _finish(db, job, "failed", "analysis_failed", {})
    finally:
        if owns:
            await client.aclose()
