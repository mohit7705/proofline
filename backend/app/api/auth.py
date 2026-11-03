import os
import uuid
from typing import Annotated, Any

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2 import id_token
from jwt.exceptions import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.core.security import (
    JWT_ALGORITHM,
    create_access_token,
    get_jwt_secret,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import (
    GoogleLoginRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
DbSession = Annotated[Session, Depends(get_db)]


def verify_google_credential(credential: str) -> dict[str, Any]:
    """Verify the Google ID token and return its verified claims."""
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(
            status_code=503,
            detail="Google authentication is not configured",
        )

    try:
        claims = id_token.verify_oauth2_token(
            credential, Request(), client_id
        )
    except (ValueError, GoogleAuthError):
        raise HTTPException(
            status_code=401,
            detail="Invalid Google credential",
        ) from None

    if claims.get("iss") not in (
        "accounts.google.com",
        "https://accounts.google.com",
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid Google token issuer",
        )

    if claims.get("email_verified") is not True:
        raise HTTPException(
            status_code=401,
            detail="Google email must be verified",
        )

    if not claims.get("sub") or not claims.get("email"):
        raise HTTPException(
            status_code=401,
            detail="Google token is missing required account details",
        )

    return claims


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(payload: RegisterRequest, db: DbSession) -> User:
    user = User(
        email=str(payload.email).lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=payload.role,
        is_active=True,
    )
    if len(user.full_name) < 2:
        raise HTTPException(
            status_code=422,
            detail="Name must contain at least 2 characters",
        )

    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists",
        ) from None
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    user = db.scalar(
        select(User).where(User.email == str(payload.email).lower())
    )
    if (
        not user
        or not user.password_hash
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/google", response_model=TokenResponse)
def google_login(
    payload: GoogleLoginRequest, db: DbSession
) -> TokenResponse:
    claims = verify_google_credential(payload.credential)
    google_sub = str(claims["sub"])
    email = str(claims["email"]).strip().lower()
    full_name = str(claims.get("name") or "").strip()

    user = db.scalar(
        select(User).where(User.google_sub == google_sub)
    )

    if user is None:
        # Never silently link a Google identity to an existing email account.
        existing_email_user = db.scalar(
            select(User).where(User.email == email)
        )
        if existing_email_user is not None:
            raise HTTPException(
                status_code=409,
                detail=(
                    "An account with this email already exists. "
                    "Sign in with your existing method before linking Google."
                ),
            )

        if len(full_name) < 2:
            full_name = email.split("@", 1)[0][:200] or "Google User"

        user = User(
            email=email,
            password_hash=None,
            google_sub=google_sub,
            full_name=full_name[:200],
            role=payload.role,
            is_active=True,
        )
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except IntegrityError:
            db.rollback()
            # Covers concurrent creation or an already-registered Google subject.
            user = db.scalar(
                select(User).where(User.google_sub == google_sub)
            )
            if user is None:
                raise HTTPException(
                    status_code=409,
                    detail="An account with this email already exists",
                ) from None

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    return TokenResponse(access_token=create_access_token(str(user.id)))


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: DbSession,
) -> User:
    unauthorized = HTTPException(
        status_code=401,
        detail="Invalid or expired access token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            get_jwt_secret(),
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp"]},
        )
        user_id = uuid.UUID(payload["sub"])
    except (InvalidTokenError, ValueError, TypeError, KeyError):
        raise unauthorized from None

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("/me", response_model=UserResponse)
def read_current_user(user: CurrentUser) -> User:
    return user


def require_roles(*allowed_roles: str):
    """Restrict an endpoint to users with an allowed role."""

    def role_checker(user: CurrentUser) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return role_checker