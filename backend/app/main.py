from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.work_orders import router as work_orders_router
from app.api.tasks import router as tasks_router
from app.api.locations import router as locations_router
from app.api.requirements import router as requirements_router
from app.api.evidence import router as evidence_router
from app.api.video_analysis import router as video_analysis_router
from app.api.workflow import router as workflow_router
from app.api.verification import router as verification_router
from app.api.ai_jobs import router as ai_jobs_router
from app.api.dashboard import router as dashboard_router
from app.api.scores import router as scores_router
from app.api.challenge import router as challenge_router
from app.api.score_jobs import router as score_jobs_router
from contextlib import asynccontextmanager

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.middleware import RequestContextMiddleware, SECURITY_HEADERS
from app.core.rate_limit import RateLimitMiddleware

from app.core.database import check_database_connection, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown resources."""
    yield
    engine.dispose()


app = FastAPI(
    title="Proofline AI API",
    description="Evidence-based verification for real-world work.",
    version="0.1.0",
    lifespan=lifespan,
)

_settings = get_settings()
logging.basicConfig(
    level=_settings.log_level.upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

# Keep request URLs of outgoing AI calls out of the logs.
logging.getLogger("httpx").setLevel(logging.WARNING)

# The last middleware added is the outermost one, so CORS headers also appear
# on rate-limit (429) answers.
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestContextMiddleware)
_origins = [item.strip() for item in _settings.cors_origins.split(",") if item.strip()]
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Retry-After"],
        max_age=600,
    )


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    logging.getLogger("proofline.errors").exception("Unhandled error")
    request_id = getattr(request.state, "request_id", uuid.uuid4().hex)
    response = JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "request_id": request_id,
        },
    )
    response.headers["X-Request-ID"] = request_id
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    if request.url.path.startswith("/auth"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health", tags=["Health"])
def health_check() -> JSONResponse:
    try:
        check_database_connection()
        return JSONResponse(
            status_code=200,
            content={
                "status": "healthy",
                "service": "proofline-api",
                "database": "connected",
            },
        )
    except Exception:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "service": "proofline-api",
                "database": "disconnected",
            },
        )


@app.get("/", tags=["Root"])
def root() -> dict[str, str]:
    return {
        "message": "Welcome to the Proofline AI API",
        "docs": "/docs",
    }

app.include_router(auth_router)

app.include_router(work_orders_router)
app.include_router(tasks_router)
app.include_router(locations_router)
app.include_router(requirements_router)
app.include_router(evidence_router)
app.include_router(video_analysis_router)
app.include_router(workflow_router)
app.include_router(verification_router)
app.include_router(ai_jobs_router)
app.include_router(dashboard_router)
app.include_router(scores_router)
app.include_router(challenge_router)
app.include_router(score_jobs_router)

app.include_router(users_router)
