"""Audit router — paginated audit log queries.

Endpoint:
    GET /api/v1/audit/logs — paginated audit log (auditor, admin, super_admin)

Requirements: 11.2
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request

from src.application.services.audit_service import AuditService
from src.domain.entities.admin_user import AdminUser
from src.presentation.middleware.jwt_validation import AdminRole, require_roles

router = APIRouter(prefix="/audit", tags=["audit"])


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


def _get_audit_service(request: Request) -> AuditService:
    return request.app.state.audit_service  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/logs")
async def get_audit_logs(
    request: Request,
    start_date: str | None = Query(default=None, description="ISO 8601 start date"),
    end_date: str | None = Query(default=None, description="ISO 8601 end date"),
    actor_user_id: str | None = Query(default=None, description="Filter by actor user ID"),
    target_service: str | None = Query(default=None, description="Filter by target service"),
    http_method: str | None = Query(default=None, description="Filter by HTTP method"),
    limit: int = Query(default=50, ge=1, le=200),
    next_token: str | None = Query(default=None, description="Pagination cursor"),
    audit_service: AuditService = Depends(_get_audit_service),
    current_user: AdminUser = Depends(require_roles(AdminRole.AUDITOR, AdminRole.ADMIN, AdminRole.SUPER_ADMIN)),
) -> dict[str, Any]:
    """Return paginated, filterable audit log entries.

    Restricted to auditor, admin, and super_admin roles.

    Requirements: 11.2
    """
    return await audit_service.query_logs(
        start_date=start_date,
        end_date=end_date,
        actor_user_id=actor_user_id,
        target_service=target_service,
        http_method=http_method,
        limit=limit,
        next_token=next_token,
    )
