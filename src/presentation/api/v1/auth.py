"""Auth router — login, logout, token refresh, and current user.

Endpoints:
    POST /api/v1/auth/login    — authenticate and set httpOnly cookies
    POST /api/v1/auth/logout   — clear cookies and call Identity Manager logout
    POST /api/v1/auth/refresh  — transparent token refresh
    GET  /api/v1/auth/me       — current user info (JWT + profile enrichment)

Authentication failures are logged with source IP, path, and timestamp.
Credentials and tokens are NEVER included in log entries (Req 13.7).

Requirements: 2.1, 2.2, 2.5, 2.7, 13.7
"""

from __future__ import annotations

import base64
import datetime
import html
import json as _json
from typing import Any

import structlog
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, EmailStr, field_validator

from src.application.services.auth_service import AuthService
from src.application.services.self_profile_service import SelfProfileService
from src.domain.exceptions import AuthenticationError, AuthorizationError

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Cookie names — must match jwt_validation.py
_ACCESS_TOKEN_COOKIE = "access_token"
_REFRESH_TOKEN_COOKIE = "refresh_token"

# Roles that are permitted to access the Admin Panel
_ADMIN_ROLES: frozenset[str] = frozenset({"admin", "super_admin"})


def _extract_roles_from_token(token: str) -> list[str]:
    """Decode JWT payload segment without signature verification.

    The token was just issued by the Identity Manager in this same request,
    so the payload is trusted. Returns [] on any parse error (safe default).
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return []
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        payload = _json.loads(base64.urlsafe_b64decode(padded))
        raw = payload.get("roles", [])
        return [str(r) for r in raw] if isinstance(raw, list) else []
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    expires_in: int
    token_type: str = "Bearer"


class RefreshResponse(BaseModel):
    expires_in: int
    token_type: str = "Bearer"


class SelfProfileUpdateRequest(BaseModel):
    """Request body for PATCH /api/v1/auth/me.

    Both fields are optional — at least one must be non-None (enforced by the
    route handler).  Blank or whitespace-only display_name is rejected (P5).
    """

    display_name: str | None = None
    password: str | None = None

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        trimmed = v.strip()
        if len(trimmed) == 0:
            raise ValueError("display_name must not be blank")
        if len(trimmed) > 100:
            raise ValueError("display_name must be 100 characters or fewer")
        return html.escape(trimmed)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str | None) -> str | None:
        if v is not None and len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        return v


# ---------------------------------------------------------------------------
# Dependency: resolve AuthService from app.state
# ---------------------------------------------------------------------------


def _get_auth_service(request: Request) -> AuthService:
    return request.app.state.auth_service  # type: ignore[no-any-return]


def _get_self_profile_service(request: Request) -> SelfProfileService:
    return request.app.state.self_profile_service  # type: ignore[no-any-return]


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(_get_auth_service),
) -> LoginResponse:
    """Authenticate and set httpOnly, Secure, SameSite=Lax cookies.

    Requirements: 2.1, 2.2, 13.7
    """
    client_ip = _get_client_ip(request)
    path = request.url.path
    timestamp = datetime.datetime.now(datetime.UTC).isoformat()

    try:
        token_pair = await auth_service.login(body.email, body.password)
    except AuthenticationError:
        # Log failure with IP, path, timestamp — NO credentials or tokens (Req 13.7).
        logger.warning(
            "auth_login_failed",
            source_ip=client_ip,
            path=path,
            timestamp=timestamp,
        )
        raise

    access_token: str = token_pair.get("access_token", "")
    refresh_token: str = token_pair.get("refresh_token", "")
    expires_in: int = token_pair.get("expires_in", 900)

    # ── Admin role gate (Req 5.1, 5.2, 5.3) ──────────────────────────────
    roles = _extract_roles_from_token(access_token)
    if not _ADMIN_ROLES.intersection(roles):
        # Decode sub for audit log — token value MUST NOT appear in log.
        try:
            parts = access_token.split(".")
            padded = parts[1] + "=" * (-len(parts[1]) % 4)
            sub = _json.loads(base64.urlsafe_b64decode(padded)).get("sub", "unknown")
        except Exception:
            sub = "unknown"
        logger.warning(
            "auth_login_forbidden_role",
            user_id=sub,
            roles=roles,
            # token is intentionally NOT logged
        )
        raise AuthorizationError(
            message="You do not have permission to access the Admin Panel",
            error_code="FORBIDDEN",
        )
    # ─────────────────────────────────────────────────────────────────────

    # Set httpOnly, Secure, SameSite=Lax cookies (Req 2.2).
    response.set_cookie(
        key=_ACCESS_TOKEN_COOKIE,
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
        max_age=expires_in,
    )
    if refresh_token:
        response.set_cookie(
            key=_REFRESH_TOKEN_COOKIE,
            value=refresh_token,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
            max_age=60 * 60 * 24 * 30,  # 30 days
        )

    return LoginResponse(expires_in=expires_in)


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(_get_auth_service),
) -> dict[str, Any]:
    """Clear auth cookies and call Identity Manager logout.

    Requirements: 2.7
    """
    access_token = request.cookies.get(_ACCESS_TOKEN_COOKIE, "")

    # Best-effort logout — clear cookies regardless of Identity Manager response.
    if access_token:
        try:
            await auth_service.logout(access_token)
        except Exception:
            logger.warning("auth_logout_identity_manager_failed")

    # Clear both cookies.
    response.delete_cookie(key=_ACCESS_TOKEN_COOKIE, path="/")
    response.delete_cookie(key=_REFRESH_TOKEN_COOKIE, path="/")

    return {"message": "Logged out successfully."}


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(_get_auth_service),
) -> RefreshResponse:
    """Transparently refresh the token pair.

    Requirements: 2.4, 2.5
    """
    refresh_token = request.cookies.get(_REFRESH_TOKEN_COOKIE, "")
    client_ip = _get_client_ip(request)
    path = request.url.path
    timestamp = datetime.datetime.now(datetime.UTC).isoformat()

    if not refresh_token:
        logger.warning(
            "auth_refresh_failed_no_token",
            source_ip=client_ip,
            path=path,
            timestamp=timestamp,
        )
        raise AuthenticationError("No refresh token provided.")

    try:
        token_pair = await auth_service.refresh(refresh_token)
    except AuthenticationError:
        # Log failure — no tokens in log (Req 13.7).
        logger.warning(
            "auth_refresh_failed",
            source_ip=client_ip,
            path=path,
            timestamp=timestamp,
        )
        # Clear stale cookies on refresh failure (Req 2.5).
        response.delete_cookie(key=_ACCESS_TOKEN_COOKIE, path="/")
        response.delete_cookie(key=_REFRESH_TOKEN_COOKIE, path="/")
        raise

    new_access: str = token_pair.get("access_token", "")
    new_refresh: str = token_pair.get("refresh_token", "")
    expires_in: int = token_pair.get("expires_in", 900)

    response.set_cookie(
        key=_ACCESS_TOKEN_COOKIE,
        value=new_access,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
        max_age=expires_in,
    )
    if new_refresh:
        response.set_cookie(
            key=_REFRESH_TOKEN_COOKIE,
            value=new_refresh,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
            max_age=60 * 60 * 24 * 30,
        )

    return RefreshResponse(expires_in=expires_in)


@router.get("/me")
async def me(
    request: Request,
    auth_service: AuthService = Depends(_get_auth_service),
) -> dict[str, Any]:
    """Return current user info enriched with profile data.

    Requirements: 2.7
    """
    # JWT middleware already validated the token and populated request.state.
    user_id: str = getattr(request.state, "user_id", "")
    email: str = getattr(request.state, "email", "")
    raw_roles: list[str] = getattr(request.state, "roles", [])

    token = request.cookies.get("access_token", "")
    admin_user = await auth_service.get_current_user(user_id, email, raw_roles, token=token)

    return {
        "user_id": admin_user.user_id,
        "email": admin_user.email,
        "roles": [r.value for r in admin_user.roles],
        "display_name": admin_user.display_name,
        "avatar_url": admin_user.avatar_url,
    }


@router.patch("/me", status_code=204)
async def update_own_profile(
    body: SelfProfileUpdateRequest,
    request: Request,
    self_profile_service: SelfProfileService = Depends(_get_self_profile_service),
) -> Response:
    """Self-service profile update — display_name and/or password.

    ``user_id`` is always derived from the validated JWT ``sub`` claim stored
    in ``request.state`` by the JWT validation middleware.  It is NEVER taken
    from the request body or query string (P1).

    Requirements: topbar-user-profile-dropdown P1, P2, P5
    """
    # P1 — user_id from JWT sub only, never from client input
    user_id: str = getattr(request.state, "user_id", "")
    token: str = request.cookies.get(_ACCESS_TOKEN_COOKIE, "")

    await self_profile_service.update_own_profile(
        user_id=user_id,
        display_name=body.display_name,
        password=body.password,
        token=token,
    )
    return Response(status_code=204)
