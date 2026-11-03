from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Relevance = Literal[
    "relevant",
    "potentially_relevant",
    "not_relevant",
    "uncertain",
]


class VideoAnalysisRequest(BaseModel):
    """Internal request contract for analyzing authorized video evidence."""

    model_config = ConfigDict(extra="forbid")

    evidence_id: UUID
    task_id: UUID
    requirement_id: UUID | None = None
    task_instructions: str = Field(min_length=1, max_length=10000)
    requirement_instructions: str | None = Field(
        default=None, max_length=10000
    )
    required_viewpoints: list[str] = Field(
        default_factory=list, max_length=20
    )


class VideoObservation(BaseModel):
    """One traceable observation grounded in sampled video frames."""

    model_config = ConfigDict(extra="forbid")

    observation_id: str = Field(min_length=1, max_length=100)
    timestamp_seconds: float = Field(ge=0, allow_inf_nan=False)
    observation: str = Field(min_length=1, max_length=3000)
    relevance: Relevance
    supporting_frame_ids: list[str] = Field(min_length=1, max_length=100)
    limitations: list[str] = Field(default_factory=list, max_length=30)


class VideoCoverage(BaseModel):
    """Records the sampling coverage used for an analysis."""

    model_config = ConfigDict(extra="forbid")

    video_duration_seconds: float = Field(ge=0, allow_inf_nan=False)
    sampled_timestamps_seconds: list[float] = Field(max_length=10000)
    sampling_strategy: Literal["uniform", "adaptive", "manual"]

    @model_validator(mode="after")
    def validate_sampled_timestamps(self):
        timestamps = self.sampled_timestamps_seconds

        if any(
            not isinstance(timestamp, (int, float))
            or isinstance(timestamp, bool)
            or not 0 <= timestamp <= self.video_duration_seconds
            or not float("-inf") < timestamp < float("inf")
            for timestamp in timestamps
        ):
            raise ValueError(
                "Sample timestamps must be finite and within video duration"
            )

        if timestamps != sorted(set(timestamps)):
            raise ValueError(
                "Sample timestamps must be unique and ascending"
            )

        return self


class VideoAnalysisResult(BaseModel):
    """Validated analysis output; not a final task-review decision."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["completed", "failed"]
    observations: list[VideoObservation] = Field(
        default_factory=list, max_length=10000
    )
    confidence: float | None = Field(default=None, ge=0, le=1)
    flags: list[str] = Field(default_factory=list, max_length=30)
    coverage: VideoCoverage | None = None
    error_code: Literal[
        "integrity_failed",
        "video_decode_failed",
        "model_timeout",
        "invalid_model_response",
        "analysis_failed",
    ] | None = None

    @model_validator(mode="after")
    def validate_result_state(self):
        if self.status == "completed":
            if self.coverage is None:
                raise ValueError("Completed results require coverage")
            if self.error_code is not None:
                raise ValueError("Completed results cannot have an error code")
            if any(
                item.timestamp_seconds > self.coverage.video_duration_seconds
                for item in self.observations
            ):
                raise ValueError(
                    "Observation timestamp exceeds video duration"
                )
        else:
            if self.error_code is None:
                raise ValueError("Failed results require an error code")
            if self.observations:
                raise ValueError(
                    "Failed results cannot contain accepted observations"
                )

        return self
