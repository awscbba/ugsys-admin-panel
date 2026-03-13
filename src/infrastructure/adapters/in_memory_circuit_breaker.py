"""In-memory circuit breaker adapter.

Implements the CircuitBreaker port using an in-process state machine.

States
------
CLOSED   — Normal operation.  Failures are counted; after
           ``failure_threshold`` consecutive failures the breaker opens.
OPEN     — All calls are rejected immediately with ``ExternalServiceError``
           until the ``cooldown_seconds`` window has elapsed.
HALF_OPEN — A single probe request is allowed through.  Success resets the
            breaker to CLOSED; failure returns it to OPEN.

Requirements: 9.7
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

from src.domain.exceptions import AuthenticationError, ExternalServiceError
from src.domain.repositories.circuit_breaker import CircuitBreaker

T = TypeVar("T")

_STATE_CLOSED = "closed"
_STATE_OPEN = "open"
_STATE_HALF_OPEN = "half_open"


class InMemoryCircuitBreaker(CircuitBreaker):
    """Thread-safe (asyncio) in-memory circuit breaker.

    Parameters
    ----------
    name:
        Human-readable name used in error messages (e.g. ``"identity_manager"``).
    failure_threshold:
        Number of *consecutive* failures required to open the circuit.
        Defaults to ``5`` as specified in the design document.
    cooldown_seconds:
        Seconds to wait in OPEN state before transitioning to HALF_OPEN.
        Defaults to ``30`` as specified in the design document.
    """

    def __init__(
        self,
        name: str = "external_service",
        *,
        failure_threshold: int = 5,
        cooldown_seconds: float = 30.0,
    ) -> None:
        self._name = name
        self._failure_threshold = failure_threshold
        self._cooldown_seconds = cooldown_seconds

        self._state: str = _STATE_CLOSED
        self._consecutive_failures: int = 0
        self._opened_at: float | None = None
        # Asyncio lock to serialise state transitions under concurrent calls.
        self._lock: asyncio.Lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # CircuitBreaker port implementation
    # ------------------------------------------------------------------

    @property
    def state(self) -> str:
        """Return the current state: ``"closed"``, ``"open"``, or ``"half_open"``."""
        # Lazily transition OPEN → HALF_OPEN when the cooldown has elapsed.
        if self._state == _STATE_OPEN and self._cooldown_elapsed():
            self._state = _STATE_HALF_OPEN
        return self._state

    async def call(
        self,
        func: Callable[..., Awaitable[T]],
        *args: object,
        **kwargs: object,
    ) -> T:
        """Execute *func* through the circuit breaker.

        Raises
        ------
        ExternalServiceError
            When the circuit is OPEN (or transitions to OPEN during a
            HALF_OPEN probe that fails).
        """
        async with self._lock:
            current_state = self._get_state_with_transition()

            if current_state == _STATE_OPEN:
                raise ExternalServiceError(
                    f"Service '{self._name}' is unavailable (circuit breaker open).",
                    error_code="EXTERNAL_SERVICE_ERROR",
                )

            # HALF_OPEN: mark that a probe is in flight so subsequent
            # concurrent callers are rejected while the probe runs.
            if current_state == _STATE_HALF_OPEN:
                # Temporarily flip to OPEN so concurrent callers are rejected.
                self._state = _STATE_OPEN

        # --- Execute the function outside the lock ---
        try:
            result: T = await func(*args, **kwargs)
        except AuthenticationError:
            # 401 from the downstream service is a valid business response,
            # not a service outage — do NOT count it as a circuit failure
            # and re-raise it unchanged so callers get a proper 401.
            async with self._lock:
                if current_state == _STATE_HALF_OPEN:
                    # Restore HALF_OPEN so the next real probe can run.
                    self._state = _STATE_HALF_OPEN
            raise
        except Exception as exc:
            async with self._lock:
                self._record_failure()
            raise ExternalServiceError(
                f"Service '{self._name}' call failed: {exc}",
                error_code="EXTERNAL_SERVICE_ERROR",
            ) from exc

        async with self._lock:
            self._record_success()

        return result

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_state_with_transition(self) -> str:
        """Return current state, applying the OPEN → HALF_OPEN transition if due."""
        if self._state == _STATE_OPEN and self._cooldown_elapsed():
            self._state = _STATE_HALF_OPEN
        return self._state

    def _cooldown_elapsed(self) -> bool:
        if self._opened_at is None:
            return False
        return (time.monotonic() - self._opened_at) >= self._cooldown_seconds

    def _record_failure(self) -> None:
        """Increment failure counter and open the circuit if threshold is reached."""
        self._consecutive_failures += 1
        if self._consecutive_failures >= self._failure_threshold:
            self._state = _STATE_OPEN
            self._opened_at = time.monotonic()

    def _record_success(self) -> None:
        """Reset failure counter and close the circuit."""
        self._consecutive_failures = 0
        self._state = _STATE_CLOSED
        self._opened_at = None
