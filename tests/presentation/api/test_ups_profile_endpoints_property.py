"""Property-based tests for UPS profile proxy endpoints.

Property 7: HTML escaping of all UPS string fields
    For any string with HTML special characters (<, >, &, ", ') in UPS string
    fields, the value forwarded to UserManagementService must have those
    characters replaced with their HTML entity equivalents via html.escape.

Property 6: BFF Pydantic validation rejects invalid UPS mutation payloads
    For any bio string > 500 chars, language not matching ^[a-z]{2}$, or blank
    timezone, the BFF must return HTTP 422 before reaching UserManagementService.

Property 9: UPS profile round-trip consistency
    The set of fields in UpsProfileResponse equals the union of all four
    mutation request model fields.

Validates: Requirements 9.2-9.5, 10.1, 10.2, 14.1, 14.2
"""

from __future__ import annotations

import html
from unittest.mock import AsyncMock, MagicMock

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from hypothesis import given, settings
from hypothesis import strategies as st
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

from src.application.services.user_management_service import UserManagementService
from src.domain.exceptions import DomainError
from src.presentation.api.v1.users import (
    UpsContactUpdateRequest,
    UpsDisplayUpdateRequest,
    UpsPersonalUpdateRequest,
    UpsPreferencesUpdateRequest,
    UpsProfileResponse,
    router,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_app(svc: UserManagementService) -> FastAPI:
    app = FastAPI()
    app.state.user_management_service = svc

    class _FakeJwt(BaseHTTPMiddleware):
        async def dispatch(self, request: StarletteRequest, call_next):  # type: ignore[override]
            request.state.user_id = "usr-admin"
            request.state.email = "admin@example.com"
            request.state.roles = ["admin"]
            return await call_next(request)

    app.add_middleware(_FakeJwt)
    app.include_router(router, prefix="/api/v1")

    @app.exception_handler(DomainError)
    async def _handler(request: StarletteRequest, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=getattr(exc, "http_status", 500),
            content={"error": exc.error_code, "message": exc.user_message},
        )

    return app


def _mock_service() -> UserManagementService:
    svc = MagicMock(spec=UserManagementService)
    svc.update_ups_personal = AsyncMock(return_value=None)
    svc.update_ups_contact = AsyncMock(return_value=None)
    svc.update_ups_display = AsyncMock(return_value=None)
    svc.update_ups_preferences = AsyncMock(return_value=None)
    return svc


# Strategy: non-blank strings containing at least one HTML special char
_html_chars = st.sampled_from(["<", ">", "&", '"', "'"])
_html_string = st.builds(
    lambda prefix, special, suffix: prefix + special + suffix,
    st.text(min_size=1, max_size=20, alphabet=st.characters(categories=("L", "N", "Z"))),
    _html_chars,
    st.text(min_size=0, max_size=20, alphabet=st.characters(categories=("L", "N", "Z"))),
)


# ---------------------------------------------------------------------------
# Property 7: HTML escaping of all UPS string fields
# ---------------------------------------------------------------------------


class TestProperty7HtmlEscaping:
    """For any string with HTML special chars, the forwarded value is escaped."""

    @given(raw=_html_string)
    @settings(max_examples=100)
    def test_full_name_is_html_escaped(self, raw: str) -> None:
        svc = _mock_service()
        client = TestClient(_make_app(svc))

        client.patch(
            "/api/v1/users/u-001/ups-profile/personal",
            json={"full_name": raw},
        )

        svc.update_ups_personal.assert_called_once()
        fields = svc.update_ups_personal.call_args.kwargs["fields"]
        assert fields["full_name"] == html.escape(raw.strip())

    @given(raw=_html_string)
    @settings(max_examples=100)
    def test_contact_street_is_html_escaped(self, raw: str) -> None:
        svc = _mock_service()
        client = TestClient(_make_app(svc))

        client.patch(
            "/api/v1/users/u-001/ups-profile/contact",
            json={"street": raw},
        )

        svc.update_ups_contact.assert_called_once()
        fields = svc.update_ups_contact.call_args.kwargs["fields"]
        assert fields["street"] == html.escape(raw.strip())

    @given(raw=_html_string)
    @settings(max_examples=100)
    def test_display_name_is_html_escaped(self, raw: str) -> None:
        svc = _mock_service()
        client = TestClient(_make_app(svc))

        client.patch(
            "/api/v1/users/u-001/ups-profile/display",
            json={"display_name": raw},
        )

        svc.update_ups_display.assert_called_once()
        fields = svc.update_ups_display.call_args.kwargs["fields"]
        # display_name validator applies html.escape without strip
        assert fields["display_name"] == html.escape(raw)

    @given(raw=_html_string)
    @settings(max_examples=100)
    def test_bio_is_html_escaped(self, raw: str) -> None:
        svc = _mock_service()
        client = TestClient(_make_app(svc))

        client.patch(
            "/api/v1/users/u-001/ups-profile/display",
            json={"bio": raw},
        )

        svc.update_ups_display.assert_called_once()
        fields = svc.update_ups_display.call_args.kwargs["fields"]
        # bio validator applies html.escape without strip
        assert fields["bio"] == html.escape(raw)


# ---------------------------------------------------------------------------
# Property 6: Pydantic validation rejects invalid UPS mutation payloads
# ---------------------------------------------------------------------------

# Strategy: bio strings that exceed 500 chars after html.escape
_long_bio = st.text(min_size=501, max_size=600)

# Strategy: language strings that do NOT match ^[a-z]{2}$
_invalid_language = st.text(min_size=1, max_size=10).filter(lambda s: not __import__("re").fullmatch(r"[a-z]{2}", s))

# Strategy: blank or whitespace-only timezone
_blank_timezone = st.sampled_from(["", " ", "  ", "\t", "\n", "  \t\n  "])


class TestProperty6PydanticValidation:
    """Invalid payloads must be rejected with 422 before reaching the service."""

    @given(bio=_long_bio)
    @settings(max_examples=100)
    def test_bio_over_500_chars_returns_422(self, bio: str) -> None:
        svc = _mock_service()
        client = TestClient(_make_app(svc))

        resp = client.patch(
            "/api/v1/users/u-001/ups-profile/display",
            json={"bio": bio},
        )

        # Bio > 500 chars (or > 500 after escaping) must be rejected
        # The validator escapes first, then checks length
        escaped = html.escape(bio)
        if len(escaped) > 500:
            assert resp.status_code == 422
            svc.update_ups_display.assert_not_called()

    @given(lang=_invalid_language)
    @settings(max_examples=100)
    def test_invalid_language_returns_422(self, lang: str) -> None:
        svc = _mock_service()
        client = TestClient(_make_app(svc))

        resp = client.patch(
            "/api/v1/users/u-001/ups-profile/preferences",
            json={"language": lang},
        )

        assert resp.status_code == 422
        svc.update_ups_preferences.assert_not_called()

    @given(tz=_blank_timezone)
    @settings(max_examples=100)
    def test_blank_timezone_returns_422(self, tz: str) -> None:
        svc = _mock_service()
        client = TestClient(_make_app(svc))

        resp = client.patch(
            "/api/v1/users/u-001/ups-profile/preferences",
            json={"timezone": tz},
        )

        assert resp.status_code == 422
        svc.update_ups_preferences.assert_not_called()


# ---------------------------------------------------------------------------
# Property 9: UPS profile round-trip consistency
# ---------------------------------------------------------------------------


class TestProperty9RoundTripConsistency:
    """GET response fields must equal the union of all mutation request fields."""

    def test_response_fields_equal_union_of_mutation_fields(self) -> None:
        """The set of editable fields in UpsProfileResponse is exactly the union
        of all four mutation request model fields (excluding user_id which is
        path-only, not editable)."""
        response_fields = set(UpsProfileResponse.model_fields.keys()) - {"user_id"}

        mutation_fields: set[str] = set()
        mutation_fields |= set(UpsPersonalUpdateRequest.model_fields.keys())
        mutation_fields |= set(UpsContactUpdateRequest.model_fields.keys())
        mutation_fields |= set(UpsDisplayUpdateRequest.model_fields.keys())
        mutation_fields |= set(UpsPreferencesUpdateRequest.model_fields.keys())

        # Map notification_* fields: mutation uses short names, response uses
        # prefixed names. The response has notification_preferences_email etc.
        # while mutation has notification_email etc.
        # Normalize by checking the semantic equivalence.
        response_normalized = set()
        for f in response_fields:
            if f.startswith("notification_preferences_"):
                response_normalized.add(f.replace("notification_preferences_", "notification_"))
            else:
                response_normalized.add(f)

        assert response_normalized == mutation_fields, (
            f"Mismatch — response-only: {response_normalized - mutation_fields}, "
            f"mutation-only: {mutation_fields - response_normalized}"
        )

    @given(
        full_name=st.one_of(st.none(), st.text(min_size=1, max_size=50)),
        date_of_birth=st.one_of(st.none(), st.from_regex(r"\d{4}-\d{2}-\d{2}", fullmatch=True)),
        phone=st.one_of(st.none(), st.text(min_size=1, max_size=20)),
        bio=st.one_of(st.none(), st.text(min_size=0, max_size=100)),
        language=st.one_of(st.none(), st.from_regex(r"[a-z]{2}", fullmatch=True)),
    )
    @settings(max_examples=100)
    def test_response_model_accepts_any_valid_field_combination(
        self,
        full_name: str | None,
        date_of_birth: str | None,
        phone: str | None,
        bio: str | None,
        language: str | None,
    ) -> None:
        """For any valid field values, UpsProfileResponse can be constructed
        without error — proving the schema is complete."""
        resp = UpsProfileResponse(
            user_id="u-test",
            full_name=full_name,
            date_of_birth=date_of_birth,
            phone=phone,
            bio=bio,
            language=language,
        )
        assert resp.user_id == "u-test"
        assert resp.full_name == full_name
        assert resp.date_of_birth == date_of_birth
