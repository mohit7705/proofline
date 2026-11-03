import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class WorkOrderCreate(BaseModel):
    title: str = Field(min_length=3, max_length=250)
    description: str = Field(min_length=1, max_length=10000)
    assigned_to: uuid.UUID | None = None
    due_at: datetime | None = None


class WorkOrderUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=250)
    description: str | None = Field(default=None, min_length=1, max_length=10000)
    assigned_to: uuid.UUID | None = None
    due_at: datetime | None = None
    status: str | None = None


class WorkOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str
    created_by: uuid.UUID
    assigned_to: uuid.UUID | None
    status: str
    due_at: datetime | None
    created_at: datetime
    updated_at: datetime
    created_by_name: str | None = None
    assigned_to_name: str | None = None
    is_self_created: bool = False
