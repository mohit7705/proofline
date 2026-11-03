import pytest
from pydantic import ValidationError

from app.schemas.requirement import RequirementCreate, RequirementUpdate


def test_photo_requirement_defaults():
    requirement = RequirementCreate(
        title="Inspect equipment",
        instructions="Photograph the equipment condition",
        response_type="photo",
    )
    assert requirement.minimum_evidence_count == 0
    assert requirement.maximum_evidence_count == 10
    assert requirement.required_viewpoints == []
    assert requirement.requires_human_inspection is False


def test_photo_requirement_accepts_capture_checklist():
    requirement = RequirementCreate(
        title="Inspect equipment",
        instructions="Capture all specified angles",
        response_type="photo",
        minimum_evidence_count=3,
        maximum_evidence_count=5,
        required_viewpoints=["Front", "Back", "Serial number"],
        requires_human_inspection=True,
    )
    assert requirement.minimum_evidence_count == 3
    assert requirement.maximum_evidence_count == 5
    assert requirement.required_viewpoints == [
        "Front", "Back", "Serial number"
    ]
    assert requirement.requires_human_inspection is True


def test_rejects_maximum_below_minimum():
    with pytest.raises(ValidationError):
        RequirementCreate(
            title="Inspect equipment",
            instructions="Take photos",
            response_type="photo",
            minimum_evidence_count=4,
            maximum_evidence_count=2,
        )


def test_rejects_negative_evidence_count():
    with pytest.raises(ValidationError):
        RequirementCreate(
            title="Inspect equipment",
            instructions="Take photos",
            minimum_evidence_count=-1,
        )


def test_rejects_empty_viewpoint():
    with pytest.raises(ValidationError):
        RequirementCreate(
            title="Inspect equipment",
            instructions="Take photos",
            required_viewpoints=["Front", "  "],
        )


def test_rejects_too_many_viewpoints():
    with pytest.raises(ValidationError):
        RequirementCreate(
            title="Inspect equipment",
            instructions="Take photos",
            required_viewpoints=[f"View {i}" for i in range(21)],
        )


def test_update_schema_accepts_capture_rule_changes():
    update = RequirementUpdate(
        minimum_evidence_count=2,
        maximum_evidence_count=4,
        required_viewpoints=["Front", "Label"],
        requires_human_inspection=True,
    )
    assert update.minimum_evidence_count == 2
    assert update.maximum_evidence_count == 4
    assert update.required_viewpoints == ["Front", "Label"]
    assert update.requires_human_inspection is True
