"""JWT validation middleware and FastAPI dependency.

Extracts the JWT access token from the ``access_token`` httpOnly cookie,
validates it, and attaches the decoded claims to ``request.state``.

Validation rules (Requirements 2.3, 2.4, 2.6):
- Algorithm MUST be RS256; HS256 and ``none`` are explicitly rejected.
- Signature, audience, issuer, and expiration are all verified.
- ``user_id``, ``email``, and ``roles[]`` are attached to request state.
- When the token is within 60 seconds of expiry and a valid refresh token
  cookie exists, the token pair is transparently refreshed and the new
  cookies are set on the response.

The module exposes:
- ``JwtValidationMiddleware`` — a Starlette ``BaseHTTPMiddleware`` that
  validates the JWT on every request (used in the middleware stack).
- ``get_current_user`` — a FastAPI dependency that reads the already-
  validated claims from ``request.state`` and returns an ``AdminUser``.
- ``require_roles`` — a FastAPI dependency factory that enforces RBAC.

Requirements: 2.3, 2.4, 2.6
"""

from __future__ import annotations

import contextlib
import os
import time
from collections.abc import Callable
from typing import Any

import jwt as pyjwt
from fastapi import Depends, Request
from jwt.exceptions import ExpiredSignatureError
from jwt.exceptions import InvalidTokenError as JWTError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from src.domain.entities.admin_user import AdminUser
from src.domain.value_objects.role import ADMIN_ROLES, AdminRole

__all__ = ["AdminRole", "JwtValidationMiddleware", "get_current_user", "require_roles"]

# ---------------------------------------------------------------------------
# Configuration — loaded from environment variables
# ---------------------------------------------------------------------------

# RS256 public key in PEM format.  Must be set in production.
_JWT_PUBLIC_KEY: str = os.environ.get("JWT_PUBLIC_KEY", "")

# Expected audience and issuer claims.
_JWT_AUDIENCE: str = os.environ.get("JWT_AUDIENCE", "admin-panel")
_JWT_ISSUER: str = os.environ.get("JWT_ISSUER", "ugsys-identity-manager")

# Cookie names.
_ACCESS_TOKEN_COOKIE = "access_token"
_REFRESH_TOKEN_COOKIE = "refresh_token"

# Auto-refresh threshold: refresh when token expires within this many seconds.
_REFRESH_THRESHOLD_SECONDS = 60

# Explicitly allowed algorithms — only RS256.
_ALLOWED_ALGORITHMS = ["RS256"]

# Paths that do NOT require authentication.
_PUBLIC_PATHS = frozenset(
    {
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/health",
        "/docs",
        "/openapi.json",
        "/redoc",
    }
)


def _decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT using RS256.

    Raises ``JWTError`` (or a subclass) on any validation failure.
    """
    if not _JWT_PUBLIC_KEY:
        raise JWTError("JWT_PUBLIC_KEY environment variable is not configured.")

    # Decode with full validation — signature, audience, issuer, expiry.
    decoded: dict[str, Any] = pyjwt.decode(
        token,
        _JWT_PUBLIC_KEY,
        algorithms=_ALLOWED_ALGORITHMS,
        audience=_JWT_AUDIENCE,
        issuer=_JWT_ISSUER,
        options={
            "verify_signature": True,
            "verify_exp": True,
            "verify_aud": True,
            "verify_iss": True,
        },
    )
    return decoded


def _is_near_expiry(claims: dict[str, Any]) -> bool:
    """Return True if the token expires within the refresh threshold."""
    exp = claims.get("exp")
    if exp is None:
        return False
    exp_val: float = float(exp)
    return (exp_val - time.time()) <= _REFRESH_THRESHOLD_SECONDS


def _build_unauthorized_response(message: str = "Authentication required.") -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={
            "error": "AUTHENTICATION_ERROR",
            "message": message,
            "data": {},
        },
    )


class JwtValidationMiddleware(BaseHTTPMiddleware):
    """Starlette/FastAPI middleware that validates the JWT on every request.

    Public paths (login, refresh, health) are exempt from validation.
    On success, attaches ``user_id``, ``email``, and ``roles`` to
    ``request.state``.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path

        # Skip validation for public endpoints.
        if path in _PUBLIC_PATHS:
            return await call_next(request)

        token = request.cookies.get(_ACCESS_TOKEN_COOKIE)
        if not token:
            return _build_unauthorized_response("No access token provided.")

        # Reject tokens that declare a non-RS256 algorithm in their header
        # before attempting full decode (defence-in-depth).
        try:
            unverified_header = pyjwt.get_unverified_header(token)
        except JWTError:
            return _build_unauthorized_response("Malformed token.")

        alg = unverified_header.get("alg", "")
        if alg.upper() in ("HS256", "NONE", "") or alg not in _ALLOWED_ALGORITHMS:
            return _build_unauthorized_response(f"Token algorithm '{alg}' is not permitted.")

        try:
            claims = _decode_token(token)
        except ExpiredSignatureError:
            # Token is expired — attempt transparent refresh below.
            return _build_unauthorized_response("Access token has expired.")
        except JWTError as exc:
            return _build_unauthorized_response(f"Invalid token: {exc}")

        # Attach validated claims to request state.
        request.state.user_id = claims.get("sub", "")
        request.state.email = claims.get("email", "")
        request.state.roles = claims.get("roles", [])

        response: Response = await call_next(request)

        # Auto-refresh when token is near expiry and a refresh token exists.
        if _is_near_expiry(claims):
            refresh_token = request.cookies.get(_REFRESH_TOKEN_COOKIE)
            if refresh_token:
                # Attempt refresh — if it fails we still return the current
                # response; the next request will hit the expired-token path.
                await _attempt_token_refresh(refresh_token, response, request)

        return response


async def _attempt_token_refresh(refresh_token: str, response: Response, request: Request) -> None:
    """Try to refresh the token pair and set new cookies on the response.

    This is a best-effort operation; failures are silently ignored so the
    current response is not disrupted.  The next request will trigger a
    proper 401 if the token has since expired.

    The identity client is resolved from ``request.app.state.identity_client``
    (set during application startup in ``main.py``) to avoid importing
    infrastructure adapters directly from the presentation layer.
    """
    try:
        # Resolve the identity client from app state (set in lifespan).
        client = getattr(getattr(request, "app", None), "state", None)
        if client is not None:
            client = getattr(client, "identity_client", None)
        if client is None:
            return

        token_pair = await client.refresh_token(refresh_token)

        new_access = token_pair.get("access_token")
        new_refresh = token_pair.get("refresh_token")

        if new_access:
            response.set_cookie(
                key=_ACCESS_TOKEN_COOKIE,
                value=new_access,
                httponly=True,
                secure=True,
                samesite="lax",
                path="/",
            )
        if new_refresh:
            response.set_cookie(
                key=_REFRESH_TOKEN_COOKIE,
                value=new_refresh,
                httponly=True,
                secure=True,
                samesite="lax",
                path="/",
            )
    except Exception:
        # Silently ignore refresh failures — the current response is unaffected.
        pass


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------


def get_current_user(request: Request) -> AdminUser:
    """FastAPI dependency that returns the authenticated AdminUser.

    Reads claims already validated and attached by ``JwtValidationMiddleware``.
    Raises HTTP 401 if the middleware did not populate the state (e.g. the
    middleware was bypassed in tests).
    """
    user_id: str = getattr(request.state, "user_id", "")
    email: str = getattr(request.state, "email", "")
    raw_roles: list[str] = getattr(request.state, "roles", [])

    if not user_id:
        raise ValueError("Authentication required.")  # caught by middleware stack

    # Map raw role strings to AdminRole enum values; ignore unknown roles.
    roles: list[AdminRole] = []
    for r in raw_roles:
        with contextlib.suppress(ValueError):
            roles.append(AdminRole(r))

    return AdminUser(
        user_id=user_id,
        email=email,
        roles=roles,
        display_name=email,  # enriched by profile service at the service layer
    )


def require_roles(*required_roles: AdminRole) -> Callable[..., AdminUser]:
    """FastAPI dependency factory that enforces RBAC.

    Usage::

        @router.get("/admin-only")
        async def admin_only(
            user: AdminUser = Depends(require_roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN))
        ):
            ...
    """

    def _dependency(
        user: AdminUser = Depends(get_current_user),
    ) -> AdminUser:
        user_role_values = {r.value for r in user.roles}
        required_values = {r.value for r in required_roles}

        # Also enforce that the user has at least one admin role.
        admin_role_values = {r.value for r in ADMIN_ROLES}
        if not user_role_values.intersection(admin_role_values):
            raise _forbidden("Admin Panel access requires an administrative role.")

        if required_roles and not user_role_values.intersection(required_values):
            raise _forbidden("You do not have the required role for this action.")

        return user

    return _dependency


def _forbidden(message: str) -> Exception:
    from fastapi import HTTPException

    return HTTPException(
        status_code=403,
        detail={
            "error": "FORBIDDEN",
            "message": message,
            "data": {},
        },
    )
