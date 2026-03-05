"""Health Status entity for the Health Aggregator (Req 8.3)."""

from __future__ import annotations

from dataclasses import dataclass

from src.domain.value_objects import HealthState


@dataclass
class HealthStatus:
    """Health check result for a registered service.

    Produced by the Health Aggregator and cached in the
    Health Cache DynamoDB table.
    """

    service_name: str
    status: HealthState
    last_check: str  # ISO 8601
    response_time_ms: int
    version: str
    status_code: int | None = None
