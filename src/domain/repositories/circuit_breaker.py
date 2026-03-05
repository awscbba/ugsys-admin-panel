"""Circuit breaker port (ABC).

Defines the contract for a circuit breaker that wraps external
service calls to prevent cascade failures.

Requirements: 9.7
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from typing import TypeVar

T = TypeVar("T")


class CircuitBreaker(ABC):
    """Abstract port for a circuit breaker wrapper.

    States: CLOSED → OPEN (after consecutive failures) → HALF_OPEN
    (after cooldown) → CLOSED / OPEN.
    """

    @abstractmethod
    async def call(self, func: Callable[..., Awaitable[T]], *args: object, **kwargs: object) -> T:
        """Execute *func* through the circuit breaker.

        In CLOSED state, calls *func* normally and tracks failures.
        In OPEN state, raises immediately without calling *func*.
        In HALF_OPEN state, allows a single probe request.

        Raises ``ExternalServiceError`` when the circuit is open.
        """

    @property
    @abstractmethod
    def state(self) -> str:
        """Return the current circuit breaker state.

        One of ``"closed"``, ``"open"``, or ``"half_open"``.
        """
