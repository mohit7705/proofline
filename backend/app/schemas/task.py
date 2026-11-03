import uuid
from pydantic import BaseModel, ConfigDict, Field


class TaskCreate(BaseModel):
    title: str = Field(min_length=3, max_length=250)
    instructions: str = Field(min_length=1, max_length=10000)
    assigned_to: uuid.UUID | None = None
    location_id: uuid.UUID | None = None
    position: int = Field(default=0, ge=0)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=250)
    instructions: str | None = Field(default=None, min_length=1, max_length=10000)
    assigned_to: uuid.UUID | None = None
    location_id: uuid.UUID | None = None
    status: str | None = None
    position: int | None = Field(default=None, ge=0)


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    work_order_id: uuid.UUID
    title: str
    instructions: str
    assigned_to: uuid.UUID | None
    location_id: uuid.UUID | None
    status: str
    position: int
    assigned_to_name: str | None = None
    assigned_by_name: str | None = None
    is_self_created: bool = False


class LocationCreate(BaseModel):
    site: str = Field(min_length=1, max_length=200)
    building: str | None = Field(default=None, max_length=200)
    floor: str | None = Field(default=None, max_length=100)
    room: str | None = Field(default=None, max_length=100)
    equipment: str | None = Field(default=None, max_length=200)


class LocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    site: str
    building: str | None
    floor: str | None
    room: str | None
    equipment: str | None
