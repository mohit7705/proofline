import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Evidence, Requirement, Task

VALID_RESPONSE_TYPES = {"boolean", "text", "number", "photo", "video"}


def list_requirements(db: Session, task_id: uuid.UUID) -> list[Requirement]:
    return list(
        db.scalars(
            select(Requirement)
            .where(Requirement.task_id == task_id)
            .order_by(Requirement.position, Requirement.created_at)
        ).all()
    )


def create_requirement(
    db: Session, task: Task, data: dict
) -> Requirement:
    if data.get("response_type", "boolean") not in VALID_RESPONSE_TYPES:
        raise HTTPException(status_code=422, detail="Invalid response type")

    minimum = data.get("minimum_evidence_count", 0)
    maximum = data.get("maximum_evidence_count", 10)
    if maximum < minimum:
        raise HTTPException(
            status_code=422,
            detail="maximum_evidence_count must be >= minimum_evidence_count",
        )
    if any(not item.strip() for item in data.get("required_viewpoints", [])):
        raise HTTPException(status_code=422, detail="Viewpoints cannot be empty")

    requirement = Requirement(task_id=task.id, **data)
    db.add(requirement)
    db.commit()
    db.refresh(requirement)
    return requirement


def get_requirement(db: Session, requirement_id: uuid.UUID) -> Requirement:
    requirement = db.get(Requirement, requirement_id)
    if requirement is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return requirement


def update_requirement(
    db: Session, requirement: Requirement, changes: dict
) -> Requirement:
    if (
        "response_type" in changes
        and changes["response_type"] not in VALID_RESPONSE_TYPES
    ):
        raise HTTPException(status_code=422, detail="Invalid response type")

    new_min = changes.get("minimum_evidence_count")
    new_max = changes.get("maximum_evidence_count")
    minimum = requirement.minimum_evidence_count if new_min is None else new_min
    maximum = requirement.maximum_evidence_count if new_max is None else new_max

    if ("minimum_evidence_count" in changes and new_min is None) or (
        "maximum_evidence_count" in changes and new_max is None
    ) or ("required_viewpoints" in changes and changes["required_viewpoints"] is None):
        raise HTTPException(status_code=422, detail="Evidence requirement fields cannot be null")

    if maximum < minimum:
        raise HTTPException(
            status_code=422,
            detail="maximum_evidence_count must be >= minimum_evidence_count",
        )
    if any(not item.strip() for item in changes.get("required_viewpoints", []) or []):
        raise HTTPException(status_code=422, detail="Viewpoints cannot be empty")

    for field, value in changes.items():
        setattr(requirement, field, value)

    db.commit()
    db.refresh(requirement)
    return requirement


def delete_requirement(db: Session, requirement: Requirement) -> None:
    # Preserve evidence records linked to this requirement.
    linked_evidence = db.scalar(
        select(Evidence.id)
        .where(Evidence.requirement_id == requirement.id)
        .limit(1)
    )
    if linked_evidence is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot delete this requirement because evidence "
                "records are linked to it."
            ),
        )
    db.delete(requirement)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete this requirement because related records exist.",
        ) from None
