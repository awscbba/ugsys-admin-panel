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
  origins fetched at runtime from SSM Parameter Store (parameter name in
  ``CSP_SCRIPT_ORIGINS_PARAM`` env var). Falls back to ``CSP_SCRIPT_ORIGINS``
  env var for local development.

Header removed:
- ``Server`` — prevents technology fingerprinting (Req 13.5)

Requirements: 13.1, 13.5
"""

from __future__ import annotations

import os
import time

import boto3
import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

logger = structlog.get_logger()

_STATIC_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
}

# SSM cache TTL — 5 minutes
_SSM_CACHE_TTL = 300.0


def _build_csp(extra_script_origins: list[str]) -> str:
    """Build the Content-Security-Policy header value."""
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


def _parse_origins(raw: str) -> list[str]:
    """Split a comma-separated origins string into a deduplicated list."""
    return [o.strip() for o in raw.split(",") if o.strip()]


class _SsmOriginsCache:
    """Fetches CSP script origins from SSM Parameter Store with a TTL cache.

    Falls back to the ``CSP_SCRIPT_ORIGINS`` env var when no SSM parameter
    name is configured (local dev / unit tests).
    """

    def __init__(self) -> None:
        self._param_name: str | None = os.environ.get("CSP_SCRIPT_ORIGINS_PARAM")
        self._cached_origins: list[str] = []
        self._fetched_at: float = 0.0
        self._ssm = boto3.client("ssm") if self._param_name else None

    def get(self) -> list[str]:
        if self._param_name is None:
            # Local dev fallback — read directly from env var
            return _parse_origins(os.environ.get("CSP_SCRIPT_ORIGINS", ""))

        now = time.monotonic()
        if now - self._fetched_at < _SSM_CACHE_TTL:
            return self._cached_origins

        try:
            response = self._ssm.get_parameter(Name=self._param_name)  # type: ignore[union-attr]
            raw = response["Parameter"]["Value"]
            self._cached_origins = _parse_origins(raw)
            self._fetched_at = now
            logger.debug(
                "csp_origins.refreshed",
                param=self._param_name,
                count=len(self._cached_origins),
            )
        except Exception as exc:
            # On failure keep the stale cache; log and continue — never crash on a header
            logger.warning(
                "csp_origins.ssm_fetch_failed",
                param=self._param_name,
                error=str(exc),
            )

        return self._cached_origins


# Module-level cache instance — shared across all requests in the same Lambda container
_origins_cache = _SsmOriginsCache()


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Starlette/FastAPI middleware that injects security response headers.

    CSP script-src origins are fetched from SSM Parameter Store at runtime
    with a 5-minute TTL cache so updates take effect without a redeploy.

    Parameters
    ----------
    app:
        The ASGI application to wrap.
    extra_script_origins:
        Override origins list (used in tests). When ``None`` (default),
        origins are fetched from SSM / env var via ``_origins_cache``.
    """

    def __init__(
        self,
        app: ASGIApp,
        extra_script_origins: list[str] | None = None,
    ) -> None:
        super().__init__(app)
        self._override_origins = extra_script_origins

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response: Response = await call_next(request)

        # Static security headers
        for header, value in _STATIC_HEADERS.items():
            response.headers[header] = value

        # Dynamic CSP — use override (tests) or live SSM cache (prod)
        origins = self._override_origins if self._override_origins is not None else _origins_cache.get()
        response.headers["Content-Security-Policy"] = _build_csp(origins)

        # Remove Server header to prevent technology fingerprinting
        if "server" in response.headers:
            del response.headers["server"]

        return response
