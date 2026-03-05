"""Lambda entry point for EventBridge event subscriptions.

This module wires the EventBridgeSubscriber to the EventProcessingService
and exposes an async ``handler(event, context)`` function that AWS Lambda
invokes when an EventBridge rule fires.

Subscribed event types (Requirements 12.1):
    identity.user.created
    identity.user.updated
    identity.user.deleted
    identity.user.role_changed   → invalidate user cache (Req 12.2)
    identity.auth.login_failed   → flag suspicious activity (Req 12.3)

EventBridge event envelope (Lambda target):
    {
        "version": "0",
        "id": "<event-id>",
        "detail-type": "identity.user.role_changed",
        "source": "identity-manager",
        "account": "...",
        "time": "...",
        "region": "...",
        "detail": { ... }
    }

Requirements: 12.1, 12.2, 12.3
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from src.application.services.event_processing_service import EventProcessingService
from src.infrastructure.messaging.eventbridge_subscriber import EventBridgeSubscriber

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Singletons — instantiated once per Lambda cold start.
# ---------------------------------------------------------------------------

_event_processing_service = EventProcessingService()

_subscriber = EventBridgeSubscriber(
    handlers={
        event_type: _event_processing_service.process_event
        for event_type in (
            "identity.user.created",
            "identity.user.updated",
            "identity.user.deleted",
            "identity.user.role_changed",
            "identity.auth.login_failed",
        )
    }
)


# ---------------------------------------------------------------------------
# Lambda handler
# ---------------------------------------------------------------------------


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """AWS Lambda handler for EventBridge events.

    Supports both the standard EventBridge envelope (``detail-type`` key)
    and direct Lambda invocations that already carry the full event dict.

    Parameters
    ----------
    event:
        Raw event dict delivered by AWS Lambda.
    context:
        Lambda context object (unused).

    Returns
    -------
    dict
        ``{"statusCode": 200}`` on success.  Exceptions are logged and
        re-raised so Lambda can retry or send to a DLQ.
    """
    try:
        asyncio.run(_subscriber.handle(event))
    except Exception:
        logger.exception(
            "Unhandled exception in Lambda handler; event will be retried.",
            extra={"event_id": event.get("id", "<unknown>")},
        )
        raise

    return {"statusCode": 200}
