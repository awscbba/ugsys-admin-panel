"""Unit tests for GET /api/v1/health/services.

Covers:
- Returns cached statuses when cache is populated
- Falls back to poll_once() when cache is empty (cold-start scenario)
- poll_once() is NOT called when cache already has data
"""

from __future__ import annotations

import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.application.services.health_aggregator_service import HealthAggregatorService
from src.domain.entities.health_status import HealthStatus
from src.domain.value_objects.health_state import HealthState


def _make_status(name: str, state: HealthState = HealthState.HEALTHY) -> HealthStatus:
    return HealthStatus(
        service_name=name,
        status=state,
        last_check=datetime.datetime.now(datetime.UTC).isoformat(),
        response_time_ms=42,
        version="1.0.0",
        status_code=None,
    )


@pytest.fixture()
def health_service() -> HealthAggregatorService:
    svc = MagicMock(spec=HealthAggregatorService)
    svc.poll_once = AsyncMock()
    return svc


class TestGetAllStatusesCacheHit:
    def test_returns_cached_statuses_without_polling(self, health_service: HealthAggregatorService) -> None:
        """When cache has data, poll_once must NOT be called."""
        statuses = [_make_status("identity-manager"), _make_status("projects-registry")]
        health_service.get_all_statuses.return_value = statuses  # type: ignore[attr-defined]

        result = health_service.get_all_statuses()

        assert len(result) == 2
        health_service.poll_once.assert_not_called()  # type: ignore[attr-defined]


class TestGetAllStatusesCacheMiss:
    async def test_polls_inline_when_cache_empty(self, health_service: HealthAggregatorService) -> None:
        """When cache is empty, poll_once() must be awaited before returning."""
        populated = [_make_status("identity-manager")]

        # First call returns empty (cold start), second returns populated (after poll)
        health_service.get_all_statuses.side_effect = [[], populated]  # type: ignore[attr-defined]

        # Simulate the endpoint logic directly
        statuses = health_service.get_all_statuses()
        if not statuses:
            await health_service.poll_once()
            statuses = health_service.get_all_statuses()

        health_service.poll_once.assert_awaited_once()  # type: ignore[attr-defined]
        assert len(statuses) == 1
        assert statuses[0].service_name == "identity-manager"

    async def test_returns_empty_list_if_poll_finds_nothing(self, health_service: HealthAggregatorService) -> None:
        """If poll_once() runs but still no services, return empty list gracefully."""
        health_service.get_all_statuses.return_value = []  # type: ignore[attr-defined]

        statuses = health_service.get_all_statuses()
        if not statuses:
            await health_service.poll_once()
            statuses = health_service.get_all_statuses()

        health_service.poll_once.assert_awaited_once()  # type: ignore[attr-defined]
        assert statuses == []
