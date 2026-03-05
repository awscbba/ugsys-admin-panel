"""Correlation ID middleware.

Extracts ``X-Request-ID`` from the incoming request or generates a new
UUID v4 when the header is absent.  The correlation ID is:

- Attached to ``request.state.correlation_id`` so downstream handlers
  and services can propagate it.
- Echoed back in the ``X-Request-ID`` response header so clients can
  correlate their request with BFF and downstream logs.

Requirements: 7.3
"""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

_HEADER = "X-Request-ID"


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Starlette/FastAPI middleware that manages the request correlation ID."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Extract existing ID or generate a fresh UUID.
        correlation_id: str = request.headers.get(_HEADER) or str(uuid.uuid4())

        # Attach to request state for use by handlers and services.
        request.state.correlation_id = correlation_id

        response: Response = await call_next(request)

        # Propagate to response so the client can correlate logs.
        response.headers[_HEADER] = correlation_id
        return response
