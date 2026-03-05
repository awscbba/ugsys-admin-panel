"""Health state value object for the Health Aggregator."""

from enum import Enum


class HealthState(str, Enum):
    """Health status of a registered service (Req 8.3)."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"
