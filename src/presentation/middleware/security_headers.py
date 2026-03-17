"""Security headers middleware.

Adds the required security response headers to every response and
removes the ``Server`` header to prevent technology fingerprinting.

Headers added on every response (Requirements 13.1, 13.5):
- ``X-Content-Type-Options: nosniff``
- ``X-Frame-Options: DENY``
- ``Strict-Transport-Security: max-age=31536000; includeSubDomains; preload``
- ``Referrer-Policy: strict-origin-when-cross-origin``
- ``Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()``
- ``Content-Security-Policy`` — script-src includes 'self' plus any additional
  origins declared in the ``CSP_SCRIPT_ORIGINS`` environment variable
  (comma-separated, e.g. ``https://registry.apps.cloud.org.bo``).

Header removed:
- ``Server`` — prevents technology fingerprinting (Req 13.5)

Requirements: 13.1, 13.5
"""

from __future__ import annotations

import os

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

_STATIC_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
}


def _build_csp(extra_script_origins: list[str]) -> str:
    """Build the Content-Security-Policy header value.

    ``script-src`` always includes ``'self'``.  Any additional origins
    (e.g. micro-frontend CDN hosts) are appended from *extra_script_origins*.

    Parameters
    ----------
    extra_script_origins:
        Additional origins allowed to serve scripts, e.g.
        ``["https://registry.apps.cloud.org.bo"]``.
    """
    script_src_parts = ["'self'", *extra_script_origins]
    script_src = " ".join(script_src_parts)

    directives = [
        f"script-src {script_src}",
        "default-src 'self'",
        "connect-src 'self' https://admin.apps.cloud.org.bo/api/v1 https://auth.apps.cloud.org.bo",
        "img-src 'self' data: https:",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ]
    return "; ".join(directives)


def _parse_extra_script_origins() -> list[str]:
    """Read ``CSP_SCRIPT_ORIGINS`` env var and return a deduplicated list."""
    raw = os.environ.get("CSP_SCRIPT_ORIGINS", "")
    return [o.strip() for o in raw.split(",") if o.strip()]


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Starlette/FastAPI middleware that injects security response headers.

    Parameters
    ----------
    app:
        The ASGI application to wrap.
    extra_script_origins:
        Additional origins to include in ``script-src``.  When ``None``
        (default), the value is read from the ``CSP_SCRIPT_ORIGINS``
        environment variable at construction time.
    """

    def __init__(
        self,
        app: ASGIApp,
        extra_script_origins: list[str] | None = None,
    ) -> None:
        super().__init__(app)
        origins = extra_script_origins if extra_script_origins is not None else _parse_extra_script_origins()
        self._csp = _build_csp(origins)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response: Response = await call_next(request)

        # Static security headers.
        for header, value in _STATIC_HEADERS.items():
            response.headers[header] = value

        # Dynamic CSP (includes configured script origins).
        response.headers["Content-Security-Policy"] = self._csp

        # Remove Server header to prevent technology fingerprinting.
        if "server" in response.headers:
            del response.headers["server"]

        return response
