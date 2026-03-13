"""Health router — aggregated health status of registered services.

Endpoint:
    GET /api/v1/health/services — aggregated health (admin, super_admin only)

Each entry includes: service name, status, last check timestamp,
response time ms, version.

Requirements: 8.2, 8.3
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from src.application.services.health_aggregator_service import HealthAggregatorService
from src.domain.entities.admin_user import AdminUser
from src.domain.entities.health_status import HealthStatus
from src.presentation.middleware.jwt_validation import AdminRole, require_roles

router = APIRouter(prefix="/health", tags=["health"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class HealthStatusResponse(BaseModel):
    service_name: str
    status: str
    last_check: str
    response_time_ms: int
    version: str
    status_code: int | None = None


def _to_response(hs: HealthStatus) -> HealthStatusResponse:
    return HealthStatusResponse(
        service_name=hs.service_name,
        status=hs.status.value,
        last_check=hs.last_check,
        response_time_ms=hs.response_time_ms,
        version=hs.version,
        status_code=hs.status_code,
    )


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


def _get_health_service(request: Request) -> HealthAggregatorService:
    return request.app.state.health_aggregator_service  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/services", response_model=list[HealthStatusResponse])
async def get_health_statuses(
    request: Request,
    health_service: HealthAggregatorService = Depends(_get_health_service),
    current_user: AdminUser = Depends(require_roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)),
) -> list[HealthStatusResponse]:
    """Return aggregated health status of all registered services.

    If the in-memory cache is empty (e.g. Lambda cold start where the
    background polling task hasn't run yet), trigger a synchronous poll
    before returning so the caller always gets fresh data.

    Restricted to admin and super_admin roles.

    Requirements: 8.2, 8.3
    """
    statuses = health_service.get_all_statuses()
    if not statuses:
        # Cache miss — poll inline so the response is never empty on cold start.
        await health_service.poll_once()
        statuses = health_service.get_all_statuses()
    return [_to_response(hs) for hs in statuses]
