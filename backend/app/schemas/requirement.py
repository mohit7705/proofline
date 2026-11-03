import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RequirementCreate(BaseModel):
    title: str = Field(min_length=3, max_length=250)
    instructions: str = Field(min_length=1, max_length=10000)
    response_type: str = "boolean"
    is_required: bool = True
    position: int = Field(default=0, ge=0)
    minimum_evidence_count: int = Field(default=0, ge=0)
    maximum_evidence_count: int = Field(default=10, ge=0)
    required_viewpoints: list[str] = Field(default_factory=list, max_length=20)
    requires_human_inspection: bool = False
    requires_before_after: bool = False

    @model_validator(mode="after")
    def validate_evidence_counts(self):
        if self.maximum_evidence_count < self.minimum_evidence_count:
            raise ValueError("maximum_evidence_count must be >= minimum_evidence_count")
        if any(not item.strip() for item in self.required_viewpoints):
            raise ValueError("required_viewpoints cannot contain empty items")
        return self


class RequirementUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=250)
    instructions: str | None = Field(default=None, min_length=1, max_length=10000)
    response_type: str | None = None
    is_required: bool | None = None
    position: int | None = Field(default=None, ge=0)
    minimum_evidence_count: int | None = Field(default=None, ge=0)
    maximum_evidence_count: int | None = Field(default=None, ge=0)
    required_viewpoints: list[str] | None = Field(default=None, max_length=20)
    requires_human_inspection: bool | None = None
    requires_before_after: bool | None = None


class RequirementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    title: str
    instructions: str
    response_type: str
    is_required: bool
    position: int
    minimum_evidence_count: int
    maximum_evidence_count: int
    required_viewpoints: list[str]
    requires_human_inspection: bool
    requires_before_after: bool = False
