"""Users router — paginated user list and role/status management.

Endpoints:
    GET   /api/v1/users                                    — paginated, searchable user list (super_admin, admin)
    PATCH /api/v1/users/{user_id}/roles                    — change roles (super_admin only)
    PATCH /api/v1/users/{user_id}/status                   — activate/deactivate (super_admin, admin)
    GET   /api/v1/users/{user_id}/ups-profile              — fetch UPS profile (admin, super_admin)
    PATCH /api/v1/users/{user_id}/ups-profile/personal     — update personal fields (admin, super_admin)
    PATCH /api/v1/users/{user_id}/ups-profile/contact      — update contact fields (admin, super_admin)
    PATCH /api/v1/users/{user_id}/ups-profile/display      — update display fields (admin, super_admin)
    PATCH /api/v1/users/{user_id}/ups-profile/preferences  — update preference fields (admin, super_admin)

Requirements: 9.1, 9.4, 9.5, 8.1–8.5
"""

from __future__ import annotations

import html
import re
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, status
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


# ---------------------------------------------------------------------------
# UPS Request / Response models
# ---------------------------------------------------------------------------

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_LANG_RE = re.compile(r"^[a-z]{2}$")


def _sanitize(v: str | None, *, max_len: int | None = None, field: str = "field") -> str | None:
    """Strip, html.escape, and optionally enforce max length."""
    if v is None:
        return v
    stripped = v.strip()
    if not stripped:
        raise ValueError(f"{field} must not be blank.")
    escaped = html.escape(stripped)
    if max_len is not None and len(escaped) > max_len:
        raise ValueError(f"{field} must be {max_len} characters or fewer.")
    return escaped


class UpsPersonalUpdateRequest(BaseModel):
    full_name: str | None = None
    date_of_birth: str | None = None

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str | None) -> str | None:
        return _sanitize(v, max_len=200, field="full_name")

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not _DATE_RE.match(v):
            raise ValueError("date_of_birth must be in YYYY-MM-DD format.")
        return v


class UpsContactUpdateRequest(BaseModel):
    phone: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None

    @field_validator("phone", "street", "city", "state", "postal_code", "country")
    @classmethod
    def validate_contact_field(cls, v: str | None) -> str | None:
        return _sanitize(v, field="contact field")


class UpsDisplayUpdateRequest(BaseModel):
    bio: str | None = None
    display_name: str | None = None

    @field_validator("bio")
    @classmethod
    def validate_bio(cls, v: str | None) -> str | None:
        if v is None:
            return v
        escaped = html.escape(v)
        if len(escaped) > 500:
            raise ValueError("bio must be 500 characters or fewer.")
        return escaped

    @field_validator("display_name")
    @classmethod
    def validate_display_name_ups(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return html.escape(v)


class UpsPreferencesUpdateRequest(BaseModel):
    notification_email: bool | None = None
    notification_sms: bool | None = None
    notification_whatsapp: bool | None = None
    language: str | None = None
    timezone: str | None = None

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not _LANG_RE.match(v):
            raise ValueError("language must be a two-letter lowercase ISO code (e.g. 'es', 'en').")
        return v

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("timezone must not be blank.")
        return v.strip()


class UpsProfileResponse(BaseModel):
    user_id: str
    full_name: str | None = None
    date_of_birth: str | None = None
    phone: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    bio: str | None = None
    display_name: str | None = None
    notification_email: bool | None = None
    notification_sms: bool | None = None
    notification_whatsapp: bool | None = None
    language: str | None = None
    timezone: str | None = None


# ---------------------------------------------------------------------------
# UPS Routes
# ---------------------------------------------------------------------------


@router.get("/{user_id}/ups-profile", response_model=UpsProfileResponse)
async def get_ups_profile(
    user_id: str,
    request: Request,
    user_management_service: UserManagementService = Depends(_get_user_management_service),
    current_user: AdminUser = Depends(require_roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)),
) -> UpsProfileResponse:
    """Fetch the UPS profile for a user (admin, super_admin).

    Requirements: 8.1, 8.3
    """
    token = request.cookies.get("access_token", "")
    data = await user_management_service.get_ups_profile(user_id, token=token)
    return UpsProfileResponse(**data)


@router.patch("/{user_id}/ups-profile/personal", status_code=status.HTTP_204_NO_CONTENT)
async def update_ups_personal(
    user_id: str,
    body: UpsPersonalUpdateRequest,
    request: Request,
    user_management_service: UserManagementService = Depends(_get_user_management_service),
    current_user: AdminUser = Depends(require_roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)),
) -> None:
    """Update UPS personal fields (admin, super_admin).

    Requirements: 8.2, 9.1–9.6, 10.1–10.3
    """
    token = request.cookies.get("access_token", "")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    await user_management_service.update_ups_personal(user_id, fields=fields, token=token)


@router.patch("/{user_id}/ups-profile/contact", status_code=status.HTTP_204_NO_CONTENT)
async def update_ups_contact(
    user_id: str,
    body: UpsContactUpdateRequest,
    request: Request,
    user_management_service: UserManagementService = Depends(_get_user_management_service),
    current_user: AdminUser = Depends(require_roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)),
) -> None:
    """Update UPS contact fields (admin, super_admin).

    Requirements: 8.2, 9.1–9.6
    """
    token = request.cookies.get("access_token", "")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    await user_management_service.update_ups_contact(user_id, fields=fields, token=token)


@router.patch("/{user_id}/ups-profile/display", status_code=status.HTTP_204_NO_CONTENT)
async def update_ups_display(
    user_id: str,
    body: UpsDisplayUpdateRequest,
    request: Request,
    user_management_service: UserManagementService = Depends(_get_user_management_service),
    current_user: AdminUser = Depends(require_roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)),
) -> None:
    """Update UPS display fields (admin, super_admin).

    Requirements: 8.2, 9.1–9.6
    """
    token = request.cookies.get("access_token", "")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    await user_management_service.update_ups_display(user_id, fields=fields, token=token)


@router.patch("/{user_id}/ups-profile/preferences", status_code=status.HTTP_204_NO_CONTENT)
async def update_ups_preferences(
    user_id: str,
    body: UpsPreferencesUpdateRequest,
    request: Request,
    user_management_service: UserManagementService = Depends(_get_user_management_service),
    current_user: AdminUser = Depends(require_roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)),
) -> None:
    """Update UPS preference fields (admin, super_admin).

    Requirements: 8.2, 9.1–9.6
    """
    token = request.cookies.get("access_token", "")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    await user_management_service.update_ups_preferences(user_id, fields=fields, token=token)
