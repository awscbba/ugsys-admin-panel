"""EventBridge subscriber adapter.

Provides a handler that processes incoming EventBridge Lambda invocation
events and routes them to registered per-event-type callables.

Expected Lambda event shape (EventBridge rule → Lambda target):
    {
        "version": "0",
        "id": "<event-id>",
        "detail-type": "identity.user.role_changed",
        "source": "identity-manager",
        "detail": { ... }
    }

Event types subscribed:
    identity.user.created
    identity.user.updated
    identity.user.deleted
    identity.user.role_changed
    identity.auth.login_failed

Usage::

    from src.infrastructure.messaging.eventbridge_subscriber import (
        EventBridgeSubscriber,
    )

    subscriber = EventBridgeSubscriber(
        handlers={
            "identity.user.role_changed": handle_role_changed,
            "identity.auth.login_failed": handle_login_failed,
        }
    )

    # In the Lambda handler:
    async def lambda_handler(event, context):
        await subscriber.handle(event)

Requirements: 12.1, 12.4
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger(__name__)

# Canonical set of event types this service subscribes to.
SUBSCRIBED_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "identity.user.created",
        "identity.user.updated",
        "identity.user.deleted",
        "identity.user.role_changed",
        "identity.auth.login_failed",
    }
)

# Type alias for an async event handler callable.
EventHandler = Callable[[dict[str, Any]], Awaitable[None]]


class EventBridgeSubscriber:
    """Routes incoming EventBridge events to registered async handlers.

    Parameters
    ----------
    handlers:
        Mapping of event type strings to async callables.  Each callable
        receives the ``detail`` dict extracted from the EventBridge
        envelope.  Unknown event types are logged and silently ignored.

    Example
    -------
    .. code-block:: python

        subscriber = EventBridgeSubscriber(
            handlers={
                "identity.user.role_changed": my_role_changed_handler,
                "identity.auth.login_failed": my_login_failed_handler,
            }
        )
        await subscriber.handle(lambda_event)
    """

    def __init__(self, handlers: dict[str, EventHandler]) -> None:
        self._handlers: dict[str, EventHandler] = dict(handlers)

    def register(self, event_type: str, handler: EventHandler) -> None:
        """Register (or replace) a handler for *event_type* at runtime."""
        self._handlers[event_type] = handler

    async def handle(self, event: dict[str, Any]) -> None:
        """Process a single EventBridge Lambda invocation event.

        Extracts ``detail-type`` and ``detail`` from the envelope, looks
        up the registered handler, and invokes it.  If no handler is
        registered the event is logged and skipped.  Handler exceptions
        are caught, logged, and swallowed so that a single bad event
        cannot block subsequent processing (Req 12.6).

        Parameters
        ----------
        event:
            Raw EventBridge event dict as received by the Lambda handler.
        """
        event_type: str = event.get("detail-type", "")
        event_id: str = event.get("id", "<unknown>")
        detail: dict[str, Any] = event.get("detail") or {}

        if not event_type:
            logger.warning(
                "Received EventBridge event with missing 'detail-type'; skipping.",
                extra={"event_id": event_id},
            )
            return

        handler = self._handlers.get(event_type)
        if handler is None:
            logger.debug(
                "No handler registered for event type '%s'; skipping.",
                event_type,
                extra={"event_id": event_id},
            )
            return

        try:
            await handler(detail)
        except Exception:
            # Log and continue — failed event processing must not block
            # subsequent events (Req 12.6).
            logger.exception(
                "Error processing event '%s' (id=%s); continuing.",
                event_type,
                event_id,
                extra={"event_id": event_id, "event_type": event_type},
            )
