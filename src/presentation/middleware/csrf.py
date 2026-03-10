"""CSRF Double Submit Cookie middleware.

Implements the Double Submit Cookie pattern for CSRF protection on all
state-changing requests (POST, PUT, PATCH, DELETE).

Token format: ``{random_hex}.{timestamp}.{hmac_signature}``

Cookie attributes:
- ``SameSite=Strict`` — prevents cross-site request forgery
- NOT ``httpOnly`` — JavaScript must be able to read the cookie to send
  the ``X-CSRF-Token`` header
- ``Secure=True`` — only transmitted over HTTPS

Validation:
- On state-changing requests, the ``X-CSRF-Token`` header must be present
  and match the ``csrf_token`` cookie value (constant-time comparison).
- Mismatches are rejected with HTTP 403.

Requirements: 2.8
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

_STATE_CHANGING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_CSRF_COOKIE_NAME = "csrf_token"
_CSRF_HEADER_NAME = "X-CSRF-Token"

# Paths exempt from CSRF validation — login and refresh use credentials/tokens,
# not cookies, so CSRF protection is not applicable.
_CSRF_EXEMPT_PATHS = frozenset({"/api/v1/auth/login", "/api/v1/auth/refresh"})

# Secret key for HMAC signing — loaded from environment or generated at startup.
# In production this MUST be set via the CSRF_SECRET environment variable.
_CSRF_SECRET: bytes = os.environ.get("CSRF_SECRET", secrets.token_hex(32)).encode()


def _generate_csrf_token() -> str:
    """Generate a signed CSRF token: ``{random_hex}.{timestamp}.{hmac_signature}``."""
    random_part = secrets.token_hex(16)
    timestamp = str(int(time.time()))
    payload = f"{random_part}.{timestamp}"
    signature = hmac.new(
        _CSRF_SECRET,
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}.{signature}"


def _verify_csrf_token(token: str) -> bool:
    """Verify that a CSRF token has a valid HMAC signature."""
    parts = token.split(".")
    if len(parts) != 3:
        return False
    random_part, timestamp, provided_sig = parts
    payload = f"{random_part}.{timestamp}"
    expected_sig = hmac.new(
        _CSRF_SECRET,
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    # Constant-time comparison to prevent timing attacks.
    return hmac.compare_digest(provided_sig, expected_sig)


class CsrfMiddleware(BaseHTTPMiddleware):
    """Starlette/FastAPI middleware implementing the Double Submit Cookie pattern."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Validate CSRF token on state-changing requests.
        if request.method in _STATE_CHANGING_METHODS and request.url.path not in _CSRF_EXEMPT_PATHS:
            cookie_token = request.cookies.get(_CSRF_COOKIE_NAME)
            header_token = request.headers.get(_CSRF_HEADER_NAME)

            if not cookie_token or not header_token:
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": "FORBIDDEN",
                        "message": "CSRF token missing.",
                        "data": {},
                    },
                )

            # Constant-time comparison of header vs cookie.
            if not hmac.compare_digest(cookie_token, header_token):
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": "FORBIDDEN",
                        "message": "CSRF token mismatch.",
                        "data": {},
                    },
                )

            # Also verify the token's own HMAC signature.
            if not _verify_csrf_token(cookie_token):
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": "FORBIDDEN",
                        "message": "CSRF token invalid.",
                        "data": {},
                    },
                )

        response: Response = await call_next(request)

        # Issue a fresh CSRF token cookie if one is not already present.
        if not request.cookies.get(_CSRF_COOKIE_NAME):
            token = _generate_csrf_token()
            response.set_cookie(
                key=_CSRF_COOKIE_NAME,
                value=token,
                httponly=False,  # JS must read this to send the header
                secure=True,
                samesite="strict",
                path="/",
            )

        return response
