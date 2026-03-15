"""Users router — paginated user list and role/status management.

Endpoints:
    GET   /api/v1/users                        — paginated, searchable user list (super_admin, admin)
    PATCH /api/v1/users/{user_id}/roles        — change roles (super_admin only)
    PATCH /api/v1/users/{user_id}/status       — activate/deactivate (super_admin, admin)

Requirements: 9.1, 9.4, 9.5
"""

from __future__ import annotations

import html
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, EmailStr, field_validator

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


class ProfileUpdateRequest(BaseModel):
    """Request body for PATCH /{user_id}/profile.

    All fields are optional — only provided fields are updated.
    Role enforcement (email, password) is applied server-side in the service.
    """

    display_name: str | None = None
    email: EmailStr | None = None
    password: str | None = None

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("display_name must not be blank.")
        if len(stripped) > 100:
            raise ValueError("display_name must be 100 characters or fewer.")
        return html.escape(stripped)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str | None) -> str | None:
        if v is not None and len(v) < 8:
            raise ValueError("password must be at least 8 characters.")
        return v


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
    token = request.cookies.get("access_token", "")
    return await user_management_service.list_users(
        token=token,
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
    token = request.cookies.get("access_token", "")
    requesting_roles = [r.value for r in current_user.roles]
    await user_management_service.change_roles(
        user_id=user_id,
        roles=body.roles,
        requesting_user_roles=requesting_roles,
        token=token,
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
    token = request.cookies.get("access_token", "")
    requesting_roles = [r.value for r in current_user.roles]
    await user_management_service.change_status(
        user_id=user_id,
        status=body.status,
        requesting_user_roles=requesting_roles,
        token=token,
    )


@router.patch("/{user_id}/profile", status_code=204)
async def update_profile(
    user_id: str,
    body: ProfileUpdateRequest,
    request: Request,
    user_management_service: UserManagementService = Depends(_get_user_management_service),
    current_user: AdminUser = Depends(require_roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)),
) -> None:
    """Update a user's profile fields and/or password (admin, super_admin).

    Role enforcement is applied server-side in UserManagementService:
    - display_name: editable by admin and super_admin
    - email: editable by super_admin only (silently discarded for admin)
    - password: settable by super_admin only (silently discarded for admin)

    Requirements: 10.1, 10.2, 10.3, 10.4
    """
    token = request.cookies.get("access_token", "")
    requesting_roles = [r.value for r in current_user.roles]
    await user_management_service.update_profile(
        user_id=user_id,
        display_name=body.display_name,
        email=str(body.email) if body.email is not None else None,
        password=body.password,
        requesting_user_roles=requesting_roles,
        token=token,
    )
