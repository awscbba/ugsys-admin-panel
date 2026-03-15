"""Unit tests for PATCH /api/v1/users/{user_id}/profile.

Covers:
- 204 success (admin role — display_name only)
- 204 success (super_admin role — all fields)
- 422 blank display_name
- 422 invalid email format
- 422 password < 8 chars
- 403 missing required role (viewer)
- 401 missing JWT (no access_token cookie)
- 502 when UserManagementService raises ExternalServiceError
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from src.application.services.user_management_service import UserManagementService
from src.domain.exceptions import DomainError, ExternalServiceError
from src.presentation.api.v1.users import ProfileUpdateRequest, router

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_app(
    svc: UserManagementService,
    *,
    roles: list[str] = ("admin",),
    user_id: str = "usr-admin",
    include_jwt: bool = True,
) -> FastAPI:
    """Minimal FastAPI app with the users router and mocked auth state."""
    from fastapi.responses import JSONResponse
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request as StarletteRequest

    app = FastAPI()
    app.state.user_management_service = svc

    if include_jwt:

        class _FakeJwt(BaseHTTPMiddleware):
            async def dispatch(self, request: StarletteRequest, call_next):  # type: ignore[override]
                request.state.user_id = user_id
                request.state.email = "admin@example.com"
                request.state.roles = list(roles)
                return await call_next(request)

        app.add_middleware(_FakeJwt)

    app.include_router(router, prefix="/api/v1")

    # Register domain exception handler (mirrors main.py)
    @app.exception_handler(DomainError)
    async def _domain_handler(request: StarletteRequest, exc: DomainError) -> JSONResponse:
        status = getattr(exc, "http_status", 500)
        return JSONResponse(
            status_code=status,
            content={"error": exc.error_code, "message": exc.user_message},
        )

    return app


def _make_service(*, side_effect: Exception | None = None) -> UserManagementService:
    svc = MagicMock(spec=UserManagementService)
    if side_effect:
        svc.update_profile = AsyncMock(side_effect=side_effect)
    else:
        svc.update_profile = AsyncMock(return_value=None)
    return svc


# ---------------------------------------------------------------------------
# Pydantic model validation (no HTTP needed)
# ---------------------------------------------------------------------------


class TestProfileUpdateRequestValidation:
    def test_blank_display_name_raises(self) -> None:
        with pytest.raises(ValidationError):
            ProfileUpdateRequest(display_name="   ")

    def test_display_name_over_100_chars_raises(self) -> None:
        with pytest.raises(ValidationError):
            ProfileUpdateRequest(display_name="x" * 101)

    def test_password_under_8_chars_raises(self) -> None:
        with pytest.raises(ValidationError):
            ProfileUpdateRequest(password="short")

    def test_invalid_email_raises(self) -> None:
        with pytest.raises(ValidationError):
            ProfileUpdateRequest(email="not-an-email")

    def test_valid_display_name_accepted(self) -> None:
        req = ProfileUpdateRequest(display_name="Alice")
        assert req.display_name == "Alice"

    def test_valid_email_accepted(self) -> None:
        req = ProfileUpdateRequest(email="alice@example.com")
        assert str(req.email) == "alice@example.com"

    def test_valid_password_accepted(self) -> None:
        req = ProfileUpdateRequest(password="ValidPass1!")
        assert req.password == "ValidPass1!"

    def test_display_name_trimmed_and_escaped(self) -> None:
        req = ProfileUpdateRequest(display_name="  <Alice>  ")
        assert req.display_name == "&lt;Alice&gt;"

    def test_all_none_is_valid(self) -> None:
        """All fields optional — empty body is valid at model level."""
        req = ProfileUpdateRequest()
        assert req.display_name is None
        assert req.email is None
        assert req.password is None


# ---------------------------------------------------------------------------
# HTTP route tests — success
# ---------------------------------------------------------------------------


class TestPatchProfileSuccess:
    def test_204_admin_display_name_only(self) -> None:
        svc = _make_service()
        client = TestClient(_make_app(svc, roles=["admin"]), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/usr-target/profile",
            json={"display_name": "Alice"},
            cookies={"access_token": "fake.jwt"},
        )

        assert resp.status_code == 204
        svc.update_profile.assert_awaited_once()
        kwargs = svc.update_profile.call_args.kwargs
        assert kwargs["user_id"] == "usr-target"
        assert kwargs["display_name"] == "Alice"
        assert kwargs["requesting_user_roles"] == ["admin"]

    def test_204_super_admin_all_fields(self) -> None:
        svc = _make_service()
        client = TestClient(_make_app(svc, roles=["super_admin"]), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/usr-target/profile",
            json={
                "display_name": "Bob",
                "email": "bob@example.com",
                "password": "N3wP@ss!",
            },
            cookies={"access_token": "fake.jwt"},
        )

        assert resp.status_code == 204
        kwargs = svc.update_profile.call_args.kwargs
        assert kwargs["display_name"] == "Bob"
        assert kwargs["email"] == "bob@example.com"
        assert kwargs["password"] == "N3wP@ss!"
        assert kwargs["requesting_user_roles"] == ["super_admin"]

    def test_roles_forwarded_from_jwt_state(self) -> None:
        """Roles come from request.state (JWT), not from the request body."""
        svc = _make_service()
        client = TestClient(_make_app(svc, roles=["super_admin", "admin"]), raise_server_exceptions=False)

        client.patch(
            "/api/v1/users/usr-target/profile",
            json={"display_name": "Carol"},
            cookies={"access_token": "fake.jwt"},
        )

        kwargs = svc.update_profile.call_args.kwargs
        assert set(kwargs["requesting_user_roles"]) == {"super_admin", "admin"}


# ---------------------------------------------------------------------------
# HTTP route tests — validation errors
# ---------------------------------------------------------------------------


class TestPatchProfileValidationErrors:
    def test_422_blank_display_name(self) -> None:
        svc = _make_service()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/usr-target/profile",
            json={"display_name": "   "},
            cookies={"access_token": "fake.jwt"},
        )

        assert resp.status_code == 422
        svc.update_profile.assert_not_called()

    def test_422_invalid_email(self) -> None:
        svc = _make_service()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/usr-target/profile",
            json={"email": "not-an-email"},
            cookies={"access_token": "fake.jwt"},
        )

        assert resp.status_code == 422
        svc.update_profile.assert_not_called()

    def test_422_password_too_short(self) -> None:
        svc = _make_service()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/usr-target/profile",
            json={"password": "short"},
            cookies={"access_token": "fake.jwt"},
        )

        assert resp.status_code == 422
        svc.update_profile.assert_not_called()


# ---------------------------------------------------------------------------
# HTTP route tests — auth / authz
# ---------------------------------------------------------------------------


class TestPatchProfileAuthErrors:
    def test_403_viewer_role_rejected(self) -> None:
        svc = _make_service()
        client = TestClient(_make_app(svc, roles=["viewer"]), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/usr-target/profile",
            json={"display_name": "Alice"},
            cookies={"access_token": "fake.jwt"},
        )

        assert resp.status_code == 403
        svc.update_profile.assert_not_called()

    def test_401_missing_jwt_cookie(self) -> None:
        """No access_token cookie → JWT middleware returns 401."""
        svc = _make_service()
        # App without fake JWT middleware — simulates real middleware rejecting missing token
        app = FastAPI()
        app.state.user_management_service = svc

        from src.presentation.middleware.jwt_validation import JwtValidationMiddleware

        app.add_middleware(JwtValidationMiddleware)
        app.include_router(router, prefix="/api/v1")

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.patch(
            "/api/v1/users/usr-target/profile",
            json={"display_name": "Alice"},
            # No cookies — no access_token
        )

        assert resp.status_code == 401
        svc.update_profile.assert_not_called()


# ---------------------------------------------------------------------------
# HTTP route tests — service failure
# ---------------------------------------------------------------------------


class TestPatchProfileServiceFailure:
    def test_502_when_service_raises_external_service_error(self) -> None:
        svc = _make_service(
            side_effect=ExternalServiceError(
                message="Identity Manager is down",
                user_message="Service temporarily unavailable",
                error_code="EXTERNAL_SERVICE_ERROR",
            )
        )
        client = TestClient(_make_app(svc, roles=["admin"]), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/usr-target/profile",
            json={"display_name": "Alice"},
            cookies={"access_token": "fake.jwt"},
        )

        assert resp.status_code == 502
        body = resp.json()
        # Safe user_message only — no internal detail
        assert "Identity Manager is down" not in body.get("message", "")
        assert body.get("error") == "EXTERNAL_SERVICE_ERROR"
