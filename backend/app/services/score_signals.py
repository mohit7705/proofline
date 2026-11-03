"""How the saved AI score feeds the verification result.

The score is one more input to the advice. It can move a "VERIFIED" result to
"NEEDS_HUMAN_REVIEW". It never makes a task fail, never approves it, and a
task that was never scored behaves exactly as before.
"""

from sqlalchemy.orm import Session

from app.models import Task
from app.schemas.verification import IntegritySignal
from app.services.scoring import latest_score_set


def score_signals(db: Session, task: Task) -> list[IntegritySignal]:
    found = latest_score_set(db, task)
    if found.created_at is None:
        return []

    def signal(label: str, detail: str, severity: str) -> IntegritySignal:
        return IntegritySignal(label=label, detail=detail, severity=severity)

    if not found.scored or found.task is None or found.task.score is None:
        return [signal("AI score not available", "The AI could not score this task.", "info")]

    out: list[IntegritySignal] = []
    score, band = found.task.score, found.task.band
    if band == "weak":
        out.append(signal("Low AI score", f"The AI score is {score} out of 100. A person must look at this.", "warning"))
    elif band == "check":
        out.append(signal("AI score needs a check", f"The AI score is {score} out of 100.", "info"))
    for item in found.items:
        for part in item.parts:
            if part.key == "code" and part.score == 0:
                out.append(
                    signal("Challenge code not heard", "The spoken code was not heard in the After video.", "warning")
                )
                break
    return out
