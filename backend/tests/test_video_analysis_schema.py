import pytest
from pydantic import ValidationError

from app.schemas.video_analysis import (
    VideoAnalysisRequest,
    VideoAnalysisResult,
    VideoCoverage,
    VideoObservation,
)


def valid_coverage():
    return VideoCoverage(
        video_duration_seconds=30,
        sampled_timestamps_seconds=[0, 6, 12, 18, 24, 30],
        sampling_strategy="uniform",
    )


def valid_observation():
    return VideoObservation(
        observation_id="obs-001",
        timestamp_seconds=12.4,
        observation="A rectangular object is placed on a work surface.",
        relevance="potentially_relevant",
        supporting_frame_ids=["frame-0003"],
        limitations=["The object's label is not readable."],
    )


def test_analysis_request_requires_evidence_and_task_ids():
    request = VideoAnalysisRequest(
        evidence_id="00000000-0000-0000-0000-000000000001",
        task_id="00000000-0000-0000-0000-000000000002",
        task_instructions="Inspect the completed work.",
    )
    assert request.requirement_id is None
    assert request.required_viewpoints == []


def test_observation_requires_supporting_frame():
    with pytest.raises(ValidationError):
        VideoObservation(
            observation_id="obs-001",
            timestamp_seconds=2,
            observation="An object is visible.",
            relevance="relevant",
            supporting_frame_ids=[],
        )


def test_coverage_accepts_ordered_timestamps_within_duration():
    coverage = valid_coverage()
    assert coverage.sampled_timestamps_seconds[-1] == 30


@pytest.mark.parametrize(
    "timestamps",
    [[0, 12, 6], [0, 6, 6], [-1, 5], [0, 31], [0, float("nan")]],
)
def test_coverage_rejects_invalid_timestamps(timestamps):
    with pytest.raises(ValidationError):
        VideoCoverage(
            video_duration_seconds=30,
            sampled_timestamps_seconds=timestamps,
            sampling_strategy="uniform",
        )


def test_completed_result_requires_coverage():
    with pytest.raises(ValidationError):
        VideoAnalysisResult(status="completed")


def test_failed_result_requires_error_code():
    with pytest.raises(ValidationError):
        VideoAnalysisResult(status="failed")


def test_completed_result_rejects_observation_after_video_end():
    with pytest.raises(ValidationError):
        VideoAnalysisResult(
            status="completed",
            observations=[
                VideoObservation(
                    **{
                        **valid_observation().model_dump(),
                        "timestamp_seconds": 31,
                    }
                )
            ],
            coverage=valid_coverage(),
        )


def test_valid_completed_result_preserves_traceability():
    result = VideoAnalysisResult(
        status="completed",
        observations=[valid_observation()],
        coverage=valid_coverage(),
    )
    assert result.observations[0].supporting_frame_ids == ["frame-0003"]
    assert result.observations[0].timestamp_seconds == 12.4


def test_failed_result_contains_no_accepted_observations():
    with pytest.raises(ValidationError):
        VideoAnalysisResult(
            status="failed",
            error_code="model_timeout",
            observations=[valid_observation()],
        )


def test_result_rejects_unexpected_fields():
    with pytest.raises(ValidationError):
        VideoAnalysisResult(
            status="completed",
            coverage=valid_coverage(),
            unexpected_decision="approved",
        )


def test_exact_duplicate_match_serializes_correctly():
    from datetime import UTC, datetime
    from uuid import uuid4

    from app.schemas.video_analysis_api import DuplicateMatch

    match = DuplicateMatch(
        evidence_id=uuid4(),
        task_id=uuid4(),
        filename="original.png",
        uploaded_at=datetime.now(UTC),
        match_type="exact_sha256",
    )

    data = match.model_dump(mode="json")

    assert data["match_type"] == "exact_sha256"
    assert data["distance"] is None
    assert data["filename"] == "original.png"


def test_perceptual_duplicate_match_serializes_distance():
    from datetime import UTC, datetime
    from uuid import uuid4

    from app.schemas.video_analysis_api import DuplicateMatch

    match = DuplicateMatch(
        evidence_id=uuid4(),
        task_id=uuid4(),
        filename="similar-image.jpg",
        uploaded_at=datetime.now(UTC),
        match_type="perceptual_hash",
        distance=5,
    )

    data = match.model_dump(mode="json")

    assert data["match_type"] == "perceptual_hash"
    assert data["distance"] == 5


def test_duplicate_match_rejects_distance_above_64():
    import pytest
    from datetime import UTC, datetime
    from uuid import uuid4

    from pydantic import ValidationError
    from app.schemas.video_analysis_api import DuplicateMatch

    with pytest.raises(ValidationError):
        DuplicateMatch(
            evidence_id=uuid4(),
            task_id=uuid4(),
            filename="invalid.png",
            uploaded_at=datetime.now(UTC),
            match_type="perceptual_hash",
            distance=65,
        )
