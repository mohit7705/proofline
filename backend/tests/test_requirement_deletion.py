import uuid

from sqlalchemy import select

from app.models import Evidence, Requirement
from conftest import auth, create_task_for_worker


def create_requirement(setup, task_id):
    with setup["session_factory"]() as db:
        requirement = Requirement(
            task_id=uuid.UUID(task_id),
            title="Equipment condition photo",
            instructions="Capture the equipment clearly.",
            response_type="photo",
            is_required=True,
            position=0,
            minimum_evidence_count=0,
            maximum_evidence_count=10,
            required_viewpoints=[],
            requires_human_inspection=False,
        )
        db.add(requirement)
        db.commit()
        db.refresh(requirement)
        return requirement.id


def create_linked_evidence(setup, task_id, requirement_id):
    with setup["session_factory"]() as db:
        evidence = Evidence(
            task_id=uuid.UUID(task_id),
            requirement_id=requirement_id,
            submitted_by=setup["worker_id"],
            media_type="image",
            storage_key="test/evidence/test-image.jpg",
            original_filename="test-image.jpg",
            content_type="image/jpeg",
            size_bytes=100,
            integrity_status="pending",
            phase="other",
        )
        db.add(evidence)
        db.commit()
        db.refresh(evidence)
        return evidence.id


def test_cannot_delete_requirement_with_linked_evidence(setup):
    task_id = create_task_for_worker(setup)
    requirement_id = create_requirement(setup, task_id)

    evidence_id = create_linked_evidence(
        setup, task_id, requirement_id
    )

    response = setup["client"].delete(
        f"/requirements/{requirement_id}",
        headers=auth(setup["manager_token"]),
    )

    assert response.status_code == 409, response.text
    assert "evidence" in response.json()["detail"].lower()

    with setup["session_factory"]() as db:
        requirement = db.get(Requirement, requirement_id)
        evidence = db.get(Evidence, evidence_id)

        assert requirement is not None
        assert evidence is not None
        assert evidence.requirement_id == requirement_id


def test_can_delete_requirement_without_linked_evidence(setup):
    task_id = create_task_for_worker(setup)
    requirement_id = create_requirement(setup, task_id)

    response = setup["client"].delete(
        f"/requirements/{requirement_id}",
        headers=auth(setup["manager_token"]),
    )

    assert response.status_code == 204, response.text

    with setup["session_factory"]() as db:
        requirement = db.get(Requirement, requirement_id)
        evidence = db.scalar(
            select(Evidence).where(
                Evidence.requirement_id == requirement_id
            )
        )

        assert requirement is None
        assert evidence is None
