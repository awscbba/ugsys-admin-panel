"""Internal events endpoint — receives EventBridge events via Lambda or HTTP.

Exposes POST /internal/events so that an EventBridge rule can target this
BFF via an HTTP endpoint (e.g. through an API Gateway → Lambda → BFF chain,
or directly when running behind an ALB with EventBridge HTTP targets).

The endpoint is intentionally NOT mounted under /api/v1/ to keep it
separate from the public API surface.  It should be protected at the
infrastructure level (e.g. VPC-only, IAM auth on API Gateway) and is
not exposed to the Admin Shell.

Requirements: 12.1, 12.2, 12.3
"""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

router = APIRouter(tags=["internal"])


@router.post(
    "/internal/events",
    status_code=status.HTTP_200_OK,
    summary="Receive an EventBridge event",
    include_in_schema=False,  # Hide from public OpenAPI docs.
)
async def receive_event(request: Request) -> JSONResponse:
    """Accept an EventBridge event and route it to the EventBridgeSubscriber.

    The request body must be a valid EventBridge event envelope::

        {
            "version": "0",
            "id": "<event-id>",
            "detail-type": "identity.user.role_changed",
            "source": "identity-manager",
            "detail": { ... }
        }

    Returns HTTP 200 on success (including unhandled event types — they are
    logged and silently ignored).  Returns HTTP 400 if the body cannot be
    parsed as JSON.
    """
    try:
        event: dict[str, Any] = await request.json()
    except Exception:
        logger.warning("internal_events_invalid_json")
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "INVALID_JSON", "message": "Request body must be valid JSON."},
        )

    subscriber = getattr(request.app.state, "event_subscriber", None)
    if subscriber is None:
        logger.error("internal_events_subscriber_not_configured")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"error": "SUBSCRIBER_NOT_READY", "message": "Event subscriber not configured."},
        )

    await subscriber.handle(event)
    return JSONResponse(content={"status": "ok"})
