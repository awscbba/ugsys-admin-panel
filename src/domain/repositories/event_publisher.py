"""Event publisher port (ABC).

Defines the contract for publishing domain events to the event bus.

Requirements: 4.8, 8.6, 12.4
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class EventPublisher(ABC):
    """Abstract port for publishing events to the ``ugsys-event-bus``."""

    @abstractmethod
    async def publish(
        self,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        """Publish a domain event.

        Args:
            event_type: Dot-delimited event name, e.g.
                ``admin.service.registered``.
            payload: Arbitrary JSON-serialisable event data.
        """
