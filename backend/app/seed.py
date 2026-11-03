"""Demo data. Run once on an empty database:

    docker compose exec api python -m app.seed

It creates three demo users and one work order with tasks in different states:
approved, needing a person (duplicate photo), waiting for evidence, and a
video task. Safe to run again: it does nothing if the demo users exist.
"""

import hashlib
import os
import shutil
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import (
    Evidence, Location, Task, TaskScore, User, VerificationRun, WorkOrder
)
from app.services.evidence_integrity import calculate_image_phash
from app.services.requirements import create_requirement, list_requirements
from app.services.scoring import save_score_set
from app.services.tasks import create_task
from app.services.work_orders import create_work_order, update_work_order
from app.services.workflow import create_review, submit_task

PASSWORD = os.environ.get("DEMO_PASSWORD", "Proofline-Demo-2026")
USERS = [
    ("manager@proofline.demo", "Maya Manager", "manager"),
    ("worker@proofline.demo", "Wes Worker", "worker"),
    ("worker2@proofline.demo", "Wendy Worker", "worker"),
]


def _picture(seed: int) -> bytes:
    """A simple unique picture, so every demo photo has its own hash."""
    colors = [(40, 100, 170), (170, 90, 40), (60, 140, 90), (120, 70, 150)]
    image = Image.new("RGB", (320, 240), (235, 235, 235))
    draw = ImageDraw.Draw(image)
    draw.rectangle((30, 30, 290, 210), fill=colors[seed % len(colors)])
    draw.ellipse((90 + seed * 12, 70, 200 + seed * 12, 180), fill=(240, 180, 40))
    draw.line((20, 220, 300, 20 + seed * 9), fill=(190, 45, 45), width=6)
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _store(storage: Path, data: bytes, extension: str) -> tuple[str, str]:
    storage.mkdir(parents=True, exist_ok=True)
    key = f"{uuid.uuid4().hex}{extension}"
    (storage / key).write_bytes(data)
    return key, hashlib.sha256(data).hexdigest()


def _add_image(
    db, storage, task, requirement, worker, data, name, phase="other"
) -> Evidence:
    key, digest = _store(storage, data, ".png")
    evidence = Evidence(
        task_id=task.id,
        requirement_id=requirement.id if requirement else None,
        submitted_by=worker.id,
        media_type="image",
        storage_key=key,
        original_filename=name,
        content_type="image/png",
        size_bytes=len(data),
        sha256_hash=digest,
        perceptual_hash=calculate_image_phash(storage / key),
        integrity_status="pending",
        phase=phase,
    )
    db.add(evidence)
    db.commit()
    return evidence


def _make_video(storage: Path) -> tuple[str, str, int, dict] | None:
    """A 4 second test video, or None when FFmpeg is not installed."""
    if not shutil.which("ffmpeg"):
        return None
    storage.mkdir(parents=True, exist_ok=True)
    key = f"{uuid.uuid4().hex}.mp4"
    path = storage / key
    made = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-f", "lavfi",
            "-i", "testsrc=duration=4:size=320x240:rate=10",
            "-pix_fmt", "yuv420p", str(path),
        ],
        capture_output=True,
        timeout=60,
    )
    if made.returncode != 0 or not path.is_file():
        return None
    from app.api.evidence import _probe_video

    data = path.read_bytes()
    return key, hashlib.sha256(data).hexdigest(), len(data), _probe_video(path)


def seed(db: Session, storage: Path) -> dict | None:
    """Create the demo data. Returns the logins, or None if already seeded."""
    if db.scalar(select(User).where(User.email == USERS[0][0])):
        return None

    people = {}
    for email, name, role in USERS:
        user = User(
            email=email,
            password_hash=hash_password(PASSWORD),
            full_name=name,
            role=role,
            is_active=True,
        )
        db.add(user)
        people[role if role != "worker" else email.split("@")[0]] = user
    db.commit()
    manager, worker = people["manager"], people["worker"]

    location = Location(
        site="North Plant", building="Boiler house", floor="Ground", room="B-01",
        equipment="Boiler 2",
    )
    db.add(location)
    db.commit()

    order = create_work_order(
        db,
        manager,
        {
            "title": "Boiler 2 weekly inspection",
            "description": "Check the gauge, valve and meter, then record a walk-through video.",
            "assigned_to": worker.id,
            "due_at": datetime.now(timezone.utc) + timedelta(days=2),
        },
    )
    update_work_order(db, order, {"status": "open"}, manager.id)

    def task(title, text):
        return create_task(
            db, order,
            {"title": title, "instructions": text, "assigned_to": worker.id,
             "location_id": location.id},
            manager.id,
        )

    def item(t, title, kind="photo", **extra):
        return create_requirement(
            db, t,
            {"title": title, "instructions": f"Show: {title}", "response_type": kind,
             "minimum_evidence_count": 1, **extra},
        )

    # 1. Approved: two clear photos.
    t1 = task("Read the pressure gauge", "Photograph the gauge and its label.")
    r1a, r1b = item(t1, "Gauge face"), item(t1, "Gauge label")
    first_photo = _picture(0)
    _add_image(db, storage, t1, r1a, worker, first_photo, "gauge.png")
    _add_image(db, storage, t1, r1b, worker, _picture(1), "label.png")
    submit_task(db, t1, worker)
    create_review(db, t1, manager, "approved", "Gauge and label are clear.")

    # 2. Needs a person: re-uses a photo from task 1.
    t2 = task("Check the relief valve", "Photograph the valve from the front.")
    r2 = item(t2, "Valve front", required_viewpoints=["front", "label"])
    _add_image(db, storage, t2, r2, worker, first_photo, "valve.png")
    submit_task(db, t2, worker)

    # 3. Waiting for evidence.
    t3 = task("Record the meter reading", "Photograph the meter display.")
    item(t3, "Meter display")

    # 4. Video task with a saved (sample) AI analysis.
    video = _make_video(storage)
    if video is not None:
        key, digest, size, meta = video
        t4 = task("Walk-through video", "Film a slow walk around the boiler.")
        r4 = item(t4, "Walk-through", kind="video")
        evidence = Evidence(
            task_id=t4.id, requirement_id=r4.id, submitted_by=worker.id,
            media_type="video", storage_key=key, original_filename="walkthrough.mp4",
            content_type="video/mp4", media_metadata=meta, size_bytes=size,
            sha256_hash=digest, integrity_status="pending",
        )
        db.add(evidence)
        db.flush()
        now = datetime.now(timezone.utc)
        db.add(
            VerificationRun(
                evidence_id=evidence.id, model_name="muse-spark-1.3",
                model_version="muse-spark-1.3", status="completed", confidence=0.86,
                started_at=now, completed_at=now,
                findings={
                    "status": "completed", "flags": [],
                    "observations": [
                        {"observation_id": "obs-001", "timestamp_seconds": 1.0,
                         "observation": "Sample: the boiler and its pipework are visible.",
                         "relevance": "relevant", "supporting_frame_ids": ["frame-0001"],
                         "limitations": ["Sample data created by the seed script."]},
                    ],
                },
            )
        )
        db.commit()
        submit_task(db, t4, worker)

    return {"password": PASSWORD, "emails": [email for email, _, _ in USERS]}


SAMPLE_SCORES = {
    "Read the pressure gauge": (
        92, ["Both photos are clear and unique.", "No integrity or duplicate warnings."]
    ),
    "Check the relief valve": (
        48, ["The same photo appears in another task.", "A person must look at this."]
    ),
    "Walk-through video": (
        81, ["The requested area is visible in the sampled frames."]
    ),
}


def seed_v2(db: Session, storage: Path) -> bool:
    """Adds the v2 demo data to an existing demo database. Safe to run again.

    A work order Wes created for himself with a Before and an After photo, and
    sample scores on the demo tasks so every score colour can be shown before
    the live AI is connected. Returns True when something was added.
    """
    worker = db.scalar(select(User).where(User.email == "worker@proofline.demo"))
    if worker is None:
        return False
    changed = False

    title = "Wes's own check: fire extinguisher"
    if db.scalar(select(WorkOrder).where(WorkOrder.title == title)) is None:
        order = create_work_order(
            db,
            worker,
            {
                "title": title,
                "description": "A check Wes set up for himself.",
                "due_at": datetime.now(timezone.utc) + timedelta(days=3),
            },
        )
        task = create_task(
            db,
            order,
            {
                "title": "Check the extinguisher gauge",
                "instructions": "Photograph the gauge before and after the check.",
                "assigned_to": worker.id,
            },
            worker.id,
        )
        requirement = create_requirement(
            db,
            task,
            {
                "title": "Gauge needle",
                "instructions": "Show the needle in the green zone.",
                "response_type": "photo",
                "minimum_evidence_count": 2,
                "requires_before_after": True,
            },
        )
        _add_image(db, storage, task, requirement, worker, _picture(5), "before.png", "before")
        _add_image(db, storage, task, requirement, worker, _picture(6), "after.png", "after")
        changed = True

    for task_title, (score, reasons) in SAMPLE_SCORES.items():
        task = db.scalar(select(Task).where(Task.title == task_title))
        if task is None or db.scalar(
            select(TaskScore.id).where(TaskScore.task_id == task.id).limit(1)
        ):
            continue
        items = [
            {
                "requirement_id": requirement.id,
                "score": score,
                "parts": [
                    {
                        "key": "sample",
                        "label": "Sample score",
                        "score": score,
                        "detail": "Created by the seed script, not by a model.",
                    }
                ],
                "reasons": reasons,
            }
            for requirement in list_requirements(db, task.id)
        ]
        save_score_set(
            db, task, items,
            model_name="seed-sample", model_version="1", trigger="seed",
        )
        db.commit()
        changed = True
    return changed






def main() -> None:
    from app.core.dependencies import SessionLocal

    storage = Path(
        os.environ.get("EVIDENCE_STORAGE_DIR", "/var/lib/proofline/evidence")
    ).resolve()
    with SessionLocal() as db:
        result = seed(db, storage)
        added = seed_v2(db, storage)
    if result is None:
        print("Demo data already exists.")
    else:
        print("Demo data created. Password for every demo user:", result["password"])
        for email in result["emails"]:
            print("  ", email)
    if added:
        print("Added the v2 demo data (a self-created task, sample scores).")


if __name__ == "__main__":
    main()
