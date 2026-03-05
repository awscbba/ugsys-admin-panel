"""EventBridge publisher adapter.

Concrete implementation of the ``EventPublisher`` port that puts events
onto the ``ugsys-event-bus`` EventBridge event bus using boto3.

Event envelope:
    Source      : "admin-panel"
    DetailType  : <event_type>  (e.g. "admin.service.registered")
    Detail      : JSON-serialised payload dict
    EventBusName: "ugsys-event-bus"

Event types emitted:
    admin.service.registered
    admin.service.deregistered
    admin.service.health_changed
    admin.config.updated

Requirements: 4.8, 8.6, 12.4
"""

from __future__ import annotations

import json
import os
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from src.domain.exceptions import RepositoryError
from src.domain.repositories.event_publisher import EventPublisher

_EVENT_BUS_NAME = "ugsys-event-bus"
_EVENT_SOURCE = "admin-panel"


class EventBridgePublisher(EventPublisher):
    """Publishes domain events to the ``ugsys-event-bus`` EventBridge bus.

    Parameters
    ----------
    event_bus_name:
        Name of the EventBridge event bus.  Defaults to
        ``EVENT_BUS_NAME`` env var, falling back to ``"ugsys-event-bus"``.
    region_name:
        AWS region.  Defaults to ``AWS_DEFAULT_REGION`` env var or
        ``"us-east-1"``.
    client:
        Pre-built boto3 EventBridge client.  Useful for testing.  When
        ``None`` (default) a new client is created from the environment.
    """

    def __init__(
        self,
        *,
        event_bus_name: str | None = None,
        region_name: str | None = None,
        client: Any | None = None,
    ) -> None:
        self._event_bus_name = (
            event_bus_name
            or os.environ.get("EVENT_BUS_NAME", _EVENT_BUS_NAME)
        )
        self._region = region_name or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
        self._client = client or boto3.client(
            "events",
            region_name=self._region,
        )

    async def publish(
        self,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        """Put a single event onto the EventBridge bus.

        Parameters
        ----------
        event_type:
            Dot-delimited event name, e.g. ``admin.service.registered``.
        payload:
            Arbitrary JSON-serialisable event data included in the
            ``Detail`` field.

        Raises
        ------
        RepositoryError
            When boto3 raises a ``ClientError`` or ``BotoCoreError``.
        """
        entry: dict[str, Any] = {
            "Source": _EVENT_SOURCE,
            "DetailType": event_type,
            "Detail": json.dumps(payload),
            "EventBusName": self._event_bus_name,
        }

        try:
            response = self._client.put_events(Entries=[entry])
        except (ClientError, BotoCoreError) as exc:
            raise RepositoryError(
                f"Failed to publish event '{event_type}' to EventBridge: {exc}",
            ) from exc

        # EventBridge returns per-entry failure counts even on HTTP 200.
        failed = response.get("FailedEntryCount", 0)
        if failed:
            error_entries = [
                e for e in response.get("Entries", []) if e.get("ErrorCode")
            ]
            details = "; ".join(
                f"{e.get('ErrorCode')}: {e.get('ErrorMessage')}"
                for e in error_entries
            )
            raise RepositoryError(
                f"EventBridge rejected event '{event_type}': {details}",
            )
