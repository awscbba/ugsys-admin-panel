"""Audit logging middleware.

Intercepts all state-changing requests (POST, PUT, PATCH, DELETE) and
creates an immutable audit log entry after the response is produced.

Each entry records (Requirements 11.1, 11.3):
- ``timestamp``         — ISO 8601 UTC timestamp of the request
- ``actor_user_id``     — JWT ``sub`` claim (from ``request.state.user_id``)
- ``actor_display_name``— display name (from ``request.state`` or fallback)
- ``action``            — human-readable description derived from method + path
- ``target_service``    — service name extracted from the proxy path, or "bff"
- ``target_path``       — full request path
- ``http_method``       — HTTP method (POST, PUT, PATCH, DELETE)
- ``response_status``   — HTTP response status code
- ``correlation_id``    — X-Request-ID (from ``request.state.correlation_id``)

The entry is persisted via the ``AuditLogRepository`` port.  The
repository instance is resolved from ``request.app.state.audit_log_repo``
(set during application startup in ``main.py``).

Requirements: 11.1, 11.3
"""

from __future__ import annotations

import datetime

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from src.domain.entities.audit_log_entry import AuditLogEntry

_AUDITED_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Proxy path prefix used to extract the target service name.
_PROXY_PREFIX = "/api/v1/proxy/"


def _extract_target_service(path: str) -> str:
    """Extract the downstream service name from a proxy path.

    For ``/api/v1/proxy/{service_name}/...`` returns ``service_name``.
    For all other paths returns ``"bff"`` (the BFF itself is the target).
    """
    if path.startswith(_PROXY_PREFIX):
        remainder = path[len(_PROXY_PREFIX) :]
        service_name = remainder.split("/")[0]
        return service_name or "bff"
    return "bff"


def _build_action(method: str, path: str) -> str:
    """Build a human-readable action description from the HTTP method and path."""
    return f"{method} {path}"


class AuditLoggingMiddleware(BaseHTTPMiddleware):
    """Starlette/FastAPI middleware that writes audit log entries for
    every state-changing request.

    The ``AuditLogRepository`` is resolved lazily from
    ``request.app.state.audit_log_repo`` so that the middleware can be
    registered before the DI container is fully wired.  If the repository
    is not available (e.g. during tests without a full app), the audit
    entry is silently skipped.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response: Response = await call_next(request)

        # Only audit state-changing methods.
        if request.method not in _AUDITED_METHODS:
            return response

        # Best-effort audit logging — never let a logging failure affect
        # the response returned to the client.
        try:
            await self._write_audit_entry(request, response)
        except Exception:
            pass

        return response

    async def _write_audit_entry(self, request: Request, response: Response) -> None:
        """Construct and persist an audit log entry."""
        # Resolve the repository from app state.
        repo = getattr(getattr(request, "app", None), "state", None)
        if repo is not None:
            repo = getattr(repo, "audit_log_repo", None)
        if repo is None:
            return

        path = request.url.path
        method = request.method

        # Extract actor information from request state (set by JWT middleware).
        actor_user_id: str = getattr(request.state, "user_id", "anonymous")
        actor_display_name: str = getattr(request.state, "display_name", actor_user_id)
        correlation_id: str = getattr(request.state, "correlation_id", "")

        entry = AuditLogEntry(
            id="",  # Repository generates the ULID on save.
            timestamp=datetime.datetime.now(datetime.UTC).isoformat(),
            actor_user_id=actor_user_id,
            actor_display_name=actor_display_name,
            action=_build_action(method, path),
            target_service=_extract_target_service(path),
            target_path=path,
            http_method=method,
            response_status=response.status_code,
            correlation_id=correlation_id,
        )

        await repo.save(entry)
