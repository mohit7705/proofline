"""Who may start an AI analysis, and how often."""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Evidence, User, VerificationRun


def ensure_can_analyze(db: Session, evidence: Evidence, user: User) -> None:
    """Managers may analyse any evidence they can see.

    A worker may analyse only the files they uploaded themselves, and only a
    limited number of times per hour, so one person cannot use up the model budget.
    """
    if user.role != "worker":
        return
    if evidence.submitted_by != user.id:
        raise HTTPException(status_code=404, detail="Evidence not found")

    cap = get_settings().worker_analysis_per_hour
    since = datetime.now(UTC) - timedelta(hours=1)
    used = db.scalar(
        select(func.count(VerificationRun.id))
        .join(Evidence, Evidence.id == VerificationRun.evidence_id)
        .where(
            Evidence.submitted_by == user.id,
            VerificationRun.started_at >= since,
        )
    )
    if (used or 0) >= cap:
        raise HTTPException(
            status_code=429,
            detail="You have used your analysis runs for this hour. Try again later.",
            headers={"Retry-After": "600"},
        )
