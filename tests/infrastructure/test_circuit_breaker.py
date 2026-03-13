"""Unit tests for InMemoryCircuitBreaker.

Covers the critical fix: AuthenticationError must NOT be counted as a
circuit failure and must propagate unchanged (not wrapped as ExternalServiceError).
"""

from __future__ import annotations

import pytest

from src.domain.exceptions import AuthenticationError, ExternalServiceError
from src.infrastructure.adapters.in_memory_circuit_breaker import InMemoryCircuitBreaker


async def _raises_auth_error(*_: object, **__: object) -> None:
    raise AuthenticationError("Authentication failed or token is invalid.")


async def _raises_runtime_error(*_: object, **__: object) -> None:
    raise RuntimeError("connection refused")


async def _succeeds(*_: object, **__: object) -> dict[str, str]:
    return {"ok": "true"}


class TestAuthenticationErrorPassthrough:
    async def test_auth_error_propagates_as_authentication_error(self) -> None:
        """AuthenticationError must NOT be wrapped as ExternalServiceError."""
        cb = InMemoryCircuitBreaker(name="identity_manager")

        with pytest.raises(AuthenticationError):
            await cb.call(_raises_auth_error)

    async def test_auth_error_does_not_increment_failure_count(self) -> None:
        """AuthenticationError must not count toward the circuit-open threshold."""
        cb = InMemoryCircuitBreaker(name="identity_manager", failure_threshold=3)

        # Fire 3 auth errors — should NOT open the circuit.
        for _ in range(3):
            with pytest.raises(AuthenticationError):
                await cb.call(_raises_auth_error)

        assert cb.state == "closed"

    async def test_circuit_still_opens_on_real_failures(self) -> None:
        """Non-auth exceptions still count toward the failure threshold."""
        cb = InMemoryCircuitBreaker(name="identity_manager", failure_threshold=3)

        for _ in range(3):
            with pytest.raises(ExternalServiceError):
                await cb.call(_raises_runtime_error)

        assert cb.state == "open"

    async def test_auth_error_does_not_open_circuit_mixed_with_successes(self) -> None:
        """Auth errors interspersed with successes must not open the circuit."""
        cb = InMemoryCircuitBreaker(name="identity_manager", failure_threshold=2)

        await cb.call(_succeeds)

        with pytest.raises(AuthenticationError):
            await cb.call(_raises_auth_error)

        await cb.call(_succeeds)

        assert cb.state == "closed"
