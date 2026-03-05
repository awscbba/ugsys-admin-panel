"""Security headers middleware.

Adds the required security response headers to every response and
removes the ``Server`` header to prevent technology fingerprinting.

Headers added on every response (Requirements 13.1, 13.5):
- ``X-Content-Type-Options: nosniff``
- ``X-Frame-Options: DENY``
- ``Strict-Transport-Security: max-age=31536000; includeSubDomains; preload``
- ``Referrer-Policy: strict-origin-when-cross-origin``
- ``Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()``

Header removed:
- ``Server`` — prevents technology fingerprinting (Req 13.5)

Requirements: 13.1, 13.5
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

_SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Starlette/FastAPI middleware that injects security response headers."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: object) -> Response:  # type: ignore[override]
        response: Response = await call_next(request)  # type: ignore[arg-type]

        # Add all required security headers.
        for header, value in _SECURITY_HEADERS.items():
            response.headers[header] = value

        # Remove Server header to prevent technology fingerprinting.
        response.headers.pop("Server", None)

        return response
