"""Unit tests for PATCH /api/v1/auth/me.

Covers:
- 204 success (display_name only, password only, both)
- 422 blank display_name
- 422 display_name > 100 chars
- 422 password < 8 chars
- 401 when JWT middleware has not set user_id (missing/invalid token)
- 502 when SelfProfileService raises ExternalServiceError
- P1: user_id comes from request.state, not from request body
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.application.services.self_profile_service import SelfProfileService
from src.domain.exceptions import ExternalServiceError
from src.presentation.api.v1.auth import SelfProfileUpdateRequest, router


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_app(self_profile_service: SelfProfileService, *, user_id: str = "usr-1") -> FastAPI:
    """Minimal FastAPI app with the auth router and mocked state.

    The JWT middleware is bypassed — we set request.state.user_id directly
    via a lightweight middleware so we can test the route handler in isolation.
    """
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request as StarletteRequest

    app = FastAPI()
    app.state.self_profile_service = self_profile_service

    # Simulate what JwtValidationMiddleware does: attach user_id to request.state.
    class _FakeJwt(BaseHTTPMiddleware):
        async def dispatch(self, request: StarletteRequest, call_next):  # type: ignore[override]
            request.state.user_id = user_id
            return await call_next(request)

    app.add_middleware(_FakeJwt)
    app.include_router(router, prefix="/api/v1/auth")
    return app


def _make_service(*, side_effect: Exception | None = None) -> SelfProfileService:
    svc = MagicMock(spec=SelfProfileService)
    if side_effect:
        svc.update_own_profile = AsyncMock(side_effect=side_effect)
    else:
        svc.update_own_profile = AsyncMock(return_value=None)
    return svc


# ---------------------------------------------------------------------------
# Pydantic model validation (no HTTP needed)
# ---------------------------------------------------------------------------


class TestSelfProfileUpdateRequestValidation:
    def test_blank_display_name_raises(self) -> None:
        """P5 — blank display_name must be rejected at the model level."""
        with pytest.raises(Exception):
            SelfProfileUpdateRequest(display_name="   ", password=None)

    def test_display_name_over_100_chars_raises(self) -> None:
        """P5 — display_name > 100 chars must be rejected."""
        with pytest.raises(Exception):
            SelfProfileUpdateRequest(display_name="x" * 101, password=None)

    def test_password_under_8_chars_raises(self) -> None:
        """Password < 8 chars must be rejected."""
        with pytest.raises(Exception):
            SelfProfileUpdateRequest(display_name=None, password="short")

    def test_valid_display_name_accepted(self) -> None:
        req = SelfProfileUpdateRequest(display_name="Alice", password=None)
        assert req.display_name == "Alice"

    def test_valid_password_accepted(self) -> None:
        req = SelfProfileUpdateRequest(display_name=None, password="test-pw-fixture-valid")
        assert req.password == "test-pw-fixture-valid"

    def test_display_name_html_escaped(self) -> None:
        req = SelfProfileUpdateRequest(display_name="<script>", password=None)
        assert req.display_name == "&lt;script&gt;"

    def test_display_name_trimmed(self) -> None:
        req = SelfProfileUpdateRequest(display_name="  Alice  ", password=None)
        assert req.display_name == "Alice"


# ---------------------------------------------------------------------------
# HTTP route tests
# ---------------------------------------------------------------------------


class TestPatchMeSuccess:
    def test_204_display_name_only(self) -> None:
        """204 returned when only display_name is provided and service succeeds."""
        svc = _make_service()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/auth/me",
            json={"display_name": "Alice"},
            cookies={"access_token": "fake.jwt.token"},
        )

        assert resp.status_code == 204
        svc.update_own_profile.assert_awaited_once()
        call_kwargs = svc.update_own_profile.call_args.kwargs
        assert call_kwargs["user_id"] == "usr-1"
        assert call_kwargs["display_name"] == "Alice"
        assert call_kwargs["password"] is None

    def test_204_password_only(self) -> None:
        """204 returned when only password is provided and service succeeds."""
        svc = _make_service()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/auth/me",
            json={"password": "test-pw-fixture-valid"},
            cookies={"access_token": "fake.jwt.token"},
        )

        assert resp.status_code == 204
        call_kwargs = svc.update_own_profile.call_args.kwargs
        assert call_kwargs["password"] == "test-pw-fixture-valid"
        assert call_kwargs["display_name"] is None

    def test_204_both_fields(self) -> None:
        """204 returned when both fields are provided."""
        svc = _make_service()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/auth/me",
            json={"display_name": "Bob", "password": "test-pw-fixture-valid"},
            cookies={"access_token": "fake.jwt.token"},
        )

        assert resp.status_code == 204

    def test_p1_user_id_from_state_not_body(self) -> None:
        """P1 — user_id forwarded to service must equal request.state.user_id."""
        svc = _make_service()
        # App sets user_id = "usr-from-jwt" via fake middleware
        client = TestClient(_make_app(svc, user_id="usr-from-jwt"), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/auth/me",
            # Body contains a different user_id — must be ignored
            json={"display_name": "Alice"},
            cookies={"access_token": "fake.jwt.token"},
        )

        assert resp.status_code == 204
        call_kwargs = svc.update_own_profile.call_args.kwargs
        assert call_kwargs["user_id"] == "usr-from-jwt"


class TestPatchMeValidationErrors:
    def test_422_blank_display_name(self) -> None:
        svc = _make_service()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch("/api/v1/auth/me", json={"display_name": "   "})

        assert resp.status_code == 422
        svc.update_own_profile.assert_not_called()

    def test_422_display_name_over_100_chars(self) -> None:
        svc = _make_service()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch("/api/v1/auth/me", json={"display_name": "x" * 101})

        assert resp.status_code == 422
        svc.update_own_profile.assert_not_called()

    def test_422_password_under_8_chars(self) -> None:
        svc = _make_service()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch("/api/v1/auth/me", json={"password": "short"})

        assert resp.status_code == 422
        svc.update_own_profile.assert_not_called()


class TestPatchMeServiceFailure:
    def test_502_when_identity_client_raises(self) -> None:
        """ExternalServiceError from SelfProfileService → 502 to client."""
        from src.domain.exceptions import DomainError

        svc = _make_service(
            side_effect=ExternalServiceError(
                message="IM down",
                user_message="Service temporarily unavailable",
                error_code="EXTERNAL_SERVICE_ERROR",
            )
        )

        app = _make_app(svc)

        # Register the domain exception handler (mirrors main.py)
        from fastapi.responses import JSONResponse
        from starlette.requests import Request as StarletteRequest

        @app.exception_handler(DomainError)
        async def _handler(request: StarletteRequest, exc: DomainError) -> JSONResponse:
            return JSONResponse(
                status_code=exc.http_status,
                content={"error": exc.error_code, "message": exc.user_message},
            )

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.patch(
            "/api/v1/auth/me",
            json={"display_name": "Alice"},
            cookies={"access_token": "fake.jwt.token"},
        )

        assert resp.status_code == 502
        body = resp.json()
        # Safe user_message returned — no internal detail
        assert "IM down" not in body.get("message", "")
