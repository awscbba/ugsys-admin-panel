"""Unit tests for UPS profile proxy endpoints.

    GET  /api/v1/users/{user_id}/ups-profile
    PATCH /api/v1/users/{user_id}/ups-profile/personal
    PATCH /api/v1/users/{user_id}/ups-profile/contact
    PATCH /api/v1/users/{user_id}/ups-profile/display
    PATCH /api/v1/users/{user_id}/ups-profile/preferences

Requirements: 8.1–8.5, 9.1–9.6, 10.1–10.3, 13.1–13.4
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

from src.application.services.user_management_service import UserManagementService
from src.domain.exceptions import DomainError, ExternalServiceError, NotFoundError
from src.presentation.api.v1.users import router


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_app(
    svc: UserManagementService,
    *,
    roles: list[str] | None = None,
    include_jwt: bool = True,
) -> FastAPI:
    if roles is None:
        roles = ["admin"]

    from fastapi.responses import JSONResponse

    app = FastAPI()
    app.state.user_management_service = svc

    if include_jwt:

        class _FakeJwt(BaseHTTPMiddleware):
            async def dispatch(self, request: StarletteRequest, call_next):  # type: ignore[override]
                request.state.user_id = "usr-admin"
                request.state.email = "admin@example.com"
                request.state.roles = list(roles)
                return await call_next(request)

        app.add_middleware(_FakeJwt)

    app.include_router(router, prefix="/api/v1")

    @app.exception_handler(DomainError)
    async def _domain_handler(request: StarletteRequest, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.http_status,
            content={"error": exc.error_code, "message": exc.user_message},
        )

    return app


def _make_svc(
    *,
    profile_data: dict | None = None,
    get_side_effect: Exception | None = None,
    update_side_effect: Exception | None = None,
) -> UserManagementService:
    svc = MagicMock(spec=UserManagementService)
    if get_side_effect:
        svc.get_ups_profile = AsyncMock(side_effect=get_side_effect)
    else:
        svc.get_ups_profile = AsyncMock(return_value=profile_data or _sample_profile())
    svc.update_ups_personal = AsyncMock(return_value=None)
    svc.update_ups_contact = AsyncMock(return_value=None)
    svc.update_ups_display = AsyncMock(return_value=None)
    svc.update_ups_preferences = AsyncMock(return_value=None)
    if update_side_effect:
        svc.update_ups_personal = AsyncMock(side_effect=update_side_effect)
        svc.update_ups_contact = AsyncMock(side_effect=update_side_effect)
        svc.update_ups_display = AsyncMock(side_effect=update_side_effect)
        svc.update_ups_preferences = AsyncMock(side_effect=update_side_effect)
    return svc


def _sample_profile() -> dict:
    return {
        "user_id": "u1",
        "full_name": "Alice",
        "date_of_birth": "1990-01-15",
        "phone": "+591",
        "street": "Calle 1",
        "city": "Cbba",
        "state": "Cbba",
        "postal_code": "0000",
        "country": "Bolivia",
        "bio": "Hello",
        "display_name": "Alice",
        "notification_email": True,
        "notification_sms": False,
        "notification_whatsapp": False,
        "language": "es",
        "timezone": "America/La_Paz",
    }


# ---------------------------------------------------------------------------
# GET /ups-profile
# ---------------------------------------------------------------------------


class TestGetUpsProfile:
    def test_200_returns_profile(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.get(
            "/api/v1/users/u1/ups-profile",
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["full_name"] == "Alice"
        assert body["language"] == "es"
        svc.get_ups_profile.assert_awaited_once()

    def test_403_non_admin_role(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc, roles=["viewer"]), raise_server_exceptions=False)

        resp = client.get(
            "/api/v1/users/u1/ups-profile",
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 403
        svc.get_ups_profile.assert_not_called()

    def test_404_when_profile_not_found(self) -> None:
        svc = _make_svc(get_side_effect=NotFoundError("Profile not found."))
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.get(
            "/api/v1/users/u1/ups-profile",
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 404

    def test_502_when_service_unavailable(self) -> None:
        svc = _make_svc(
            get_side_effect=ExternalServiceError(
                "UPS down", user_message="Service unavailable"
            )
        )
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.get(
            "/api/v1/users/u1/ups-profile",
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 502


# ---------------------------------------------------------------------------
# PATCH /ups-profile/personal
# ---------------------------------------------------------------------------


class TestPatchUpsPersonal:
    def test_204_valid_payload(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/personal",
            json={"full_name": "Alice Updated"},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 204
        svc.update_ups_personal.assert_awaited_once()

    def test_403_non_admin_role(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc, roles=["viewer"]), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/personal",
            json={"full_name": "Alice"},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 403
        svc.update_ups_personal.assert_not_called()

    def test_422_blank_full_name(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/personal",
            json={"full_name": "   "},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 422
        svc.update_ups_personal.assert_not_called()

    def test_422_full_name_over_200_chars(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/personal",
            json={"full_name": "x" * 201},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 422

    def test_422_invalid_date_of_birth_format(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/personal",
            json={"full_name": "Alice", "date_of_birth": "15/01/1990"},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 422

    def test_html_escaping_applied_to_full_name(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        client.patch(
            "/api/v1/users/u1/ups-profile/personal",
            json={"full_name": "<script>alert(1)</script>"},
            cookies={"access_token": "tok"},
        )

        call_kwargs = svc.update_ups_personal.call_args.kwargs
        forwarded = call_kwargs["fields"]["full_name"]
        assert "<script>" not in forwarded
        assert "&lt;script&gt;" in forwarded


# ---------------------------------------------------------------------------
# PATCH /ups-profile/contact
# ---------------------------------------------------------------------------


class TestPatchUpsContact:
    def test_204_valid_payload(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/contact",
            json={"phone": "+591", "city": "Cbba"},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 204

    def test_403_non_admin_role(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc, roles=["viewer"]), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/contact",
            json={"phone": "+591"},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 403

    def test_422_blank_city(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/contact",
            json={"city": "   "},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /ups-profile/display
# ---------------------------------------------------------------------------


class TestPatchUpsDisplay:
    def test_204_valid_payload(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/display",
            json={"bio": "Hello world"},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 204

    def test_403_non_admin_role(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc, roles=["viewer"]), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/display",
            json={"bio": "Hello"},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 403

    def test_422_bio_over_500_chars(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/display",
            json={"bio": "x" * 501},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /ups-profile/preferences
# ---------------------------------------------------------------------------


class TestPatchUpsPreferences:
    def test_204_valid_payload(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/preferences",
            json={"language": "es", "timezone": "America/La_Paz"},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 204

    def test_403_non_admin_role(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc, roles=["viewer"]), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/preferences",
            json={"language": "es"},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 403

    def test_422_invalid_language_code(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/preferences",
            json={"language": "ENG"},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 422

    def test_422_blank_timezone(self) -> None:
        svc = _make_svc()
        client = TestClient(_make_app(svc), raise_server_exceptions=False)

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/preferences",
            json={"timezone": "   "},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 422

    def test_super_admin_also_allowed(self) -> None:
        svc = _make_svc()
        client = TestClient(
            _make_app(svc, roles=["super_admin"]), raise_server_exceptions=False
        )

        resp = client.patch(
            "/api/v1/users/u1/ups-profile/preferences",
            json={"language": "en"},
            cookies={"access_token": "tok"},
        )

        assert resp.status_code == 204
