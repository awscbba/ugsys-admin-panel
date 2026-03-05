"""Users router — paginated user list and role/status management.

Endpoints:
    GET   /api/v1/users                        — paginated, searchable user list (super_admin, admin)
    PATCH /api/v1/users/{user_id}/roles        — change roles (super_admin only)
    PATCH /api/v1/users/{user_id}/status       — activate/deactivate (super_admin, admin)

Requirements: 9.1, 9.4, 9.5
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from src.application.services.user_management_service import UserManagementService
from src.domain.entities.admin_user import AdminUser
from src.presentation.middleware.jwt_validation import AdminRole, require_roles

router = APIRouter(prefix="/users", tags=["users"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class ChangeRolesRequest(BaseModel):
    roles: list[str]


class ChangeStatusRequest(BaseModel):
    status: str  # "active" | "inactive"


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


def _get_user_management_service(request: Request) -> UserManagementService:
    return request.app.state.user_management_service  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("")
async def list_users(
    request: Request,
    search: str | None = Query(default=None, description="Search by name or email"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user_management_service: UserManagementService = Depends(_get_user_management_service),
    current_user: AdminUser = Depends(require_roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)),
) -> dict[str, Any]:
    """Return paginated, searchable user list enriched with profile data.

    Restricted to super_admin and admin roles.

    Requirements: 9.1
    """
    return await user_management_service.list_users(
        search=search,
        page=page,
        page_size=page_size,
    )


@router.patch("/{user_id}/roles", status_code=204)
async def change_roles(
    user_id: str,
    body: ChangeRolesRequest,
    request: Request,
    user_management_service: UserManagementService = Depends(_get_user_management_service),
    current_user: AdminUser = Depends(require_roles(AdminRole.SUPER_ADMIN)),
) -> None:
    """Change a user's roles (super_admin only).

    Requirements: 9.4
    """
    requesting_roles = [r.value for r in current_user.roles]
    await user_management_service.change_roles(
        user_id=user_id,
        roles=body.roles,
        requesting_user_roles=requesting_roles,
    )


@router.patch("/{user_id}/status", status_code=204)
async def change_status(
    user_id: str,
    body: ChangeStatusRequest,
    request: Request,
    user_management_service: UserManagementService = Depends(_get_user_management_service),
    current_user: AdminUser = Depends(require_roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)),
) -> None:
    """Activate or deactivate a user (super_admin, admin).

    Requirements: 9.5
    """
    requesting_roles = [r.value for r in current_user.roles]
    await user_management_service.change_status(
        user_id=user_id,
        status=body.status,
        requesting_user_roles=requesting_roles,
    )
