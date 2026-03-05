"""Rate limiting middleware.

Implements two independent rate limits using an in-memory sliding-window
counter (no Redis required for MVP):

1. **Per-user proxy rate limit** — 60 requests/minute across all proxied
   routes, keyed by the JWT ``sub`` claim stored in ``request.state.user_id``
   (populated by the JWT validation middleware which runs before this one).

2. **Per-IP login rate limit** — 10 requests/minute on the login endpoint
   ``/api/v1/auth/login``, keyed by the client's source IP address.

When a limit is exceeded the middleware returns HTTP 429 with a
``Retry-After`` header indicating the number of seconds until the window
resets.

Requirements: 7.6, 13.8
"""

from __future__ import annotations

import time
from collections import deque
from threading import Lock

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

_LOGIN_PATH = "/api/v1/auth/login"
_USER_LIMIT = 60  # requests per minute per authenticated user
_LOGIN_LIMIT = 10  # requests per minute per IP on the login endpoint
_WINDOW_SECONDS = 60  # sliding window size in seconds


class _SlidingWindowCounter:
    """Thread-safe sliding-window request counter.

    Stores request timestamps in a deque and evicts entries older than
    ``window_seconds`` on each access.
    """

    def __init__(self, window_seconds: int = _WINDOW_SECONDS) -> None:
        self._window = window_seconds
        # key → deque of float timestamps
        self._buckets: dict[str, deque[float]] = {}
        self._lock = Lock()

    def is_allowed(self, key: str, limit: int) -> tuple[bool, int]:
        """Check whether a new request from *key* is within the limit.

        Returns ``(allowed, retry_after_seconds)``.  When *allowed* is
        ``True``, the request is counted.  When ``False``, ``retry_after``
        is the number of seconds until the oldest entry in the window
        expires.
        """
        now = time.monotonic()
        cutoff = now - self._window

        with self._lock:
            bucket = self._buckets.setdefault(key, deque())

            # Evict timestamps outside the current window.
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= limit:
                # Oldest entry determines when the window frees up.
                retry_after = max(1, int(self._window - (now - bucket[0])) + 1)
                return False, retry_after

            bucket.append(now)
            return True, 0


# Module-level counters shared across all requests (singleton per process).
_user_counter = _SlidingWindowCounter()
_login_counter = _SlidingWindowCounter()


class RateLimitingMiddleware(BaseHTTPMiddleware):
    """Starlette/FastAPI middleware that enforces per-user and per-IP rate limits."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path

        # --- Per-IP login rate limit ---
        if path == _LOGIN_PATH:
            client_ip = self._get_client_ip(request)
            allowed, retry_after = _login_counter.is_allowed(client_ip, _LOGIN_LIMIT)
            if not allowed:
                return self._rate_limit_response(retry_after)

        # --- Per-user proxy rate limit ---
        # user_id is set by the JWT validation middleware; skip if not present
        # (e.g. the login endpoint itself is unauthenticated).
        user_id: str | None = getattr(request.state, "user_id", None)
        if user_id:
            allowed, retry_after = _user_counter.is_allowed(user_id, _USER_LIMIT)
            if not allowed:
                return self._rate_limit_response(retry_after)

        return await call_next(request)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """Extract the real client IP, preferring ``X-Forwarded-For``."""
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        if request.client:
            return request.client.host
        return "unknown"

    @staticmethod
    def _rate_limit_response(retry_after: int) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            headers={"Retry-After": str(retry_after)},
            content={
                "error": "RATE_LIMIT_EXCEEDED",
                "message": "Too many requests. Please try again later.",
                "data": {"retry_after": retry_after},
            },
        )
