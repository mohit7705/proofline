"""Public API contracts for triggering and retrieving video analysis."""
from typing import Literal
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat

class AnalyzeEvidenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timestamps_seconds: list[FiniteFloat] | None = Field(default=None, max_length=100)
    sampling_strategy: Literal["uniform", "adaptive", "manual"] = "uniform"

class DuplicateMatch(BaseModel):
    evidence_id: UUID
    task_id: UUID
    filename: str
    uploaded_at: datetime
    match_type: Literal["exact_sha256", "perceptual_hash"] = "exact_sha256"
    distance: int | None = Field(default=None, ge=0, le=64)

class AnalysisRunResponse(BaseModel):
    id: UUID
    evidence_id: UUID
    model_name: str
    model_version: str
    status: Literal["pending", "processing", "completed", "failed"]
    findings: dict
    confidence: float | None
    duplicate_matches: list[DuplicateMatch] = Field(default_factory=list)
    started_at: datetime | None
    completed_at: datetime | None
