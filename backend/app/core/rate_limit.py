"""Simple in-memory rate limiting for sensitive routes.

Good for one API process (the hackathon setup). With several processes, use
a shared store such as Redis instead.
"""

import hashlib
import re
import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str, limit: int, window: float) -> int | None:
        """Record a request. Returns seconds to wait when over the limit."""
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] >= window:
            hits.popleft()
        if len(hits) >= limit:
            return max(1, int(window - (now - hits[0])) + 1)
        hits.append(now)
        return None

    def reset(self) -> None:
        self._hits.clear()


limiter = SlidingWindowLimiter()

# (method, path pattern, limit, window seconds, group)
RULES = [
    # Starting an analysis is the costly call: a tighter limit per person.
    (
        "POST",
        re.compile(
            r"^/(evidence/[^/]+/(analyze|analyze/background)|tasks/[^/]+/score/run)$"
        ),
        10,
        60,
        "analyze",
    ),
    # Starting an analysis is the costly call: a tighter limit per person.
    (
        "POST",
        re.compile(r"^/evidence/[^/]+/(analyze|analyze/background)$"),
        10,
        60,
        "analyze",
    ),
    ("POST", re.compile(r"^/auth/login$"), 10, 60, "login"),
    ("POST", re.compile(r"^/auth/register$"), 5, 60, "register"),
    ("POST", re.compile(r"^/auth/google$"), 10, 60, "google"),
    (
        "POST",
        re.compile(
            r"^/(evidence/[^/]+/(analyze|analyze/background|segment)"
            r"|tasks/[^/]+/(transcribe|verification))$"
        ),
        20,
        60,
        "ai",
    ),
]


def client_ip(request: Request) -> str:
    if get_settings().trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if get_settings().rate_limit_enabled:
            for method, pattern, limit, window, group in RULES:
                if request.method == method and pattern.match(request.url.path):
                    who = client_ip(request)
                    if group in {"ai", "analyze"}:
                        token = request.headers.get("authorization", "")
                        who += ":" + hashlib.sha256(token.encode()).hexdigest()[:16]
                    wait = limiter.hit(f"{group}:{who}", limit, window)
                    if wait is not None:
                        return JSONResponse(
                            status_code=429,
                            content={"detail": "Too many requests. Try again shortly."},
                            headers={"Retry-After": str(wait)},
                        )
                    break
        return await call_next(request)
