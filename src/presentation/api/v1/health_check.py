"""BFF health check endpoint.

Endpoint:
    GET /health — BFF own health status (no authentication required)

Returns a simple JSON response indicating the BFF is operational.
This endpoint is excluded from JWT validation (see jwt_validation.py
_PUBLIC_PATHS).

Requirements: All (operational)
"""

from __future__ import annotations

import datetime

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health-check"])


class HealthCheckResponse(BaseModel):
    status: str
    service: str
    timestamp: str
    version: str = "0.1.0"


@router.get("/health", response_model=HealthCheckResponse)
async def health_check() -> HealthCheckResponse:
    """Return the BFF's own health status.

    This endpoint is public (no JWT required) and is used by load
    balancers, container orchestrators, and the Health Aggregator to
    verify the BFF is running.
    """
    return HealthCheckResponse(
        status="healthy",
        service="ugsys-admin-panel-bff",
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    )
