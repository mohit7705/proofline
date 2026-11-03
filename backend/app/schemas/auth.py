import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    full_name: str = Field(min_length=2, max_length=200)
    role: Literal["manager", "worker"] = "worker"


class UserCreate(BaseModel):
    """A manager adds a team member and sets the role in one step."""

    email: EmailStr
    full_name: str = Field(min_length=2, max_length=200)
    password: str = Field(min_length=12, max_length=128)
    role: Literal["manager", "worker"] = "worker"




class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=1, max_length=8192)
    # Used only when this Google sign-in creates a new account.
    role: Literal["manager", "worker"] = "worker"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: Literal["manager", "worker"]
    is_active: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"