"""Unit tests for UserProfileServiceAdapter.

Tests are written FIRST (TDD RED phase) before the adapter is implemented.

Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 15.5
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.domain.exceptions import ExternalServiceError, NotFoundError
from src.domain.repositories.circuit_breaker import CircuitBreaker

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_response(status_code: int, body: object | None = None) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.content = b"x" if body is not None else b""
    resp.json.return_value = body
    return resp


def _make_cb(open: bool = False) -> AsyncMock:
    """Return a mock CircuitBreaker.

    When ``open=True`` the ``call`` method raises ``ExternalServiceError``
    immediately (simulating an open circuit).
    """
    cb = AsyncMock(spec=CircuitBreaker)
    if open:
        cb.call.side_effect = ExternalServiceError(
            "Service 'user-profile-service' is unavailable (circuit breaker open)."
        )
    else:
        # Default: pass through to the wrapped coroutine
        async def passthrough(func, *args, **kwargs):  # type: ignore[no-untyped-def]
            return await func(*args, **kwargs)

        cb.call.side_effect = passthrough
    return cb


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def adapter():  # type: ignore[no-untyped-def]
    """Return a fresh adapter with a pass-through circuit breaker."""
    from src.infrastructure.adapters.user_profile_service_adapter import (
        UserProfileServiceAdapter,
    )

    cb = _make_cb(open=False)
    return UserProfileServiceAdapter(
        circuit_breaker=cb,
        base_url="http://ups.internal",
    )


@pytest.fixture()
def open_adapter():  # type: ignore[no-untyped-def]
    """Return an adapter whose circuit breaker is open."""
    from src.infrastructure.adapters.user_profile_service_adapter import (
        UserProfileServiceAdapter,
    )

    cb = _make_cb(open=True)
    return UserProfileServiceAdapter(
        circuit_breaker=cb,
        base_url="http://ups.internal",
    )


# ---------------------------------------------------------------------------
# get_profile
# ---------------------------------------------------------------------------


class TestGetProfile:
    @pytest.mark.asyncio
    async def test_calls_correct_url_with_bearer_token(self, adapter) -> None:  # type: ignore[no-untyped-def]
        profile_data = {"user_id": "u1", "full_name": "Alice"}
        envelope = {"data": profile_data, "meta": {"request_id": "r1"}}
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.get.return_value = _make_response(200, envelope)

            result = await adapter.get_profile("u1", token="tok-abc")

        mock_client.get.assert_called_once()
        call_args = mock_client.get.call_args
        assert "http://ups.internal/api/v1/profiles/u1" in call_args[0]
        assert call_args[1]["headers"]["Authorization"] == "Bearer tok-abc"
        assert result == profile_data

    @pytest.mark.asyncio
    async def test_raises_not_found_on_404(self, adapter) -> None:  # type: ignore[no-untyped-def]
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.get.return_value = _make_response(404)

            with pytest.raises(NotFoundError):
                await adapter.get_profile("u1", token="tok")

    @pytest.mark.asyncio
    async def test_raises_external_service_error_on_4xx(self, adapter) -> None:  # type: ignore[no-untyped-def]
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.get.return_value = _make_response(403)

            with pytest.raises(ExternalServiceError):
                await adapter.get_profile("u1", token="tok")

    @pytest.mark.asyncio
    async def test_raises_external_service_error_on_5xx(self, adapter) -> None:  # type: ignore[no-untyped-def]
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.get.return_value = _make_response(500)

            with pytest.raises(ExternalServiceError):
                await adapter.get_profile("u1", token="tok")

    @pytest.mark.asyncio
    async def test_circuit_breaker_open_raises_without_http_call(self, open_adapter) -> None:
        """Property 8: open circuit raises ExternalServiceError without HTTP call."""
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client

            with pytest.raises(ExternalServiceError):
                await open_adapter.get_profile("u1", token="tok")

            mock_client.get.assert_not_called()

    @pytest.mark.asyncio
    async def test_forwards_x_request_id_header(self, adapter) -> None:
        """Property 11: X-Request-ID forwarded to UPS."""
        profile_data = {"data": {"user_id": "u1"}, "meta": {"request_id": "r1"}}
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.get.return_value = _make_response(200, profile_data)

            await adapter.get_profile("u1", token="tok", correlation_id="req-xyz")

        call_args = mock_client.get.call_args
        assert call_args[1]["headers"].get("X-Request-ID") == "req-xyz"

    @pytest.mark.asyncio
    async def test_raises_external_service_error_on_malformed_json_body(self, adapter) -> None:
        """Regression: UPS returns 200 with non-JSON body → ExternalServiceError, not JSONDecodeError."""
        resp = MagicMock()
        resp.status_code = 200
        resp.is_success = True
        resp.content = b"not json"
        resp.json.side_effect = ValueError("Expecting value: line 1 column 1 (char 0)")

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.get.return_value = resp

            with pytest.raises(ExternalServiceError, match=r"malformed.*JSON"):
                await adapter.get_profile("u1", token="tok")


# ---------------------------------------------------------------------------
# update_personal
# ---------------------------------------------------------------------------


class TestUpdatePersonal:
    @pytest.mark.asyncio
    async def test_calls_correct_patch_sub_path(self, adapter) -> None:  # type: ignore[no-untyped-def]
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.patch.return_value = _make_response(204)

            await adapter.update_personal("u1", {"full_name": "Alice"}, token="tok")

        mock_client.patch.assert_called_once()
        url = mock_client.patch.call_args[0][0]
        assert url == "http://ups.internal/api/v1/profiles/u1/personal"

    @pytest.mark.asyncio
    async def test_raises_not_found_on_404(self, adapter) -> None:  # type: ignore[no-untyped-def]
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.patch.return_value = _make_response(404)

            with pytest.raises(NotFoundError):
                await adapter.update_personal("u1", {}, token="tok")


# ---------------------------------------------------------------------------
# update_contact
# ---------------------------------------------------------------------------


class TestUpdateContact:
    @pytest.mark.asyncio
    async def test_calls_correct_patch_sub_path(self, adapter) -> None:  # type: ignore[no-untyped-def]
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.patch.return_value = _make_response(204)

            await adapter.update_contact("u1", {"phone": "+1234"}, token="tok")

        url = mock_client.patch.call_args[0][0]
        assert url == "http://ups.internal/api/v1/profiles/u1/contact"


# ---------------------------------------------------------------------------
# update_display
# ---------------------------------------------------------------------------


class TestUpdateDisplay:
    @pytest.mark.asyncio
    async def test_calls_correct_patch_sub_path(self, adapter) -> None:  # type: ignore[no-untyped-def]
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.patch.return_value = _make_response(204)

            await adapter.update_display("u1", {"bio": "Hello"}, token="tok")

        url = mock_client.patch.call_args[0][0]
        assert url == "http://ups.internal/api/v1/profiles/u1/display"


# ---------------------------------------------------------------------------
# update_preferences
# ---------------------------------------------------------------------------


class TestUpdatePreferences:
    @pytest.mark.asyncio
    async def test_calls_correct_patch_sub_path(self, adapter) -> None:  # type: ignore[no-untyped-def]
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.patch.return_value = _make_response(204)

            await adapter.update_preferences("u1", {"language": "es"}, token="tok")

        url = mock_client.patch.call_args[0][0]
        assert url == "http://ups.internal/api/v1/profiles/u1/preferences"


# ---------------------------------------------------------------------------
# Envelope unwrapping & flattening
# ---------------------------------------------------------------------------


class TestEnvelopeUnwrap:
    @pytest.mark.asyncio
    async def test_unwraps_ups_envelope(self, adapter) -> None:
        """UPS returns {"data": {...}, "meta": {...}} — adapter must unwrap."""
        inner = {"user_id": "u1", "full_name": "Alice", "email": "a@b.com"}
        envelope = {"data": inner, "meta": {"request_id": "r1"}}
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.get.return_value = _make_response(200, envelope)

            result = await adapter.get_profile("u1", token="tok")

        assert result["user_id"] == "u1"
        assert result["full_name"] == "Alice"
        assert "data" not in result
        assert "meta" not in result

    @pytest.mark.asyncio
    async def test_flattens_nested_address(self, adapter) -> None:
        """Nested ``address`` object is flattened to top-level fields."""
        inner = {
            "user_id": "u1",
            "address": {
                "street": "123 Main",
                "city": "Springfield",
                "state": "IL",
                "postal_code": "62704",
                "country": "US",
            },
        }
        envelope = {"data": inner, "meta": {"request_id": "r1"}}
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.get.return_value = _make_response(200, envelope)

            result = await adapter.get_profile("u1", token="tok")

        assert result["street"] == "123 Main"
        assert result["city"] == "Springfield"
        assert result["country"] == "US"
        assert "address" not in result

    @pytest.mark.asyncio
    async def test_flattens_notification_preferences(self, adapter) -> None:
        """Nested ``notification_preferences`` is flattened to ``notification_*`` fields."""
        inner = {
            "user_id": "u1",
            "notification_preferences": {
                "email": True,
                "sms": False,
                "whatsapp": True,
            },
        }
        envelope = {"data": inner, "meta": {"request_id": "r1"}}
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.get.return_value = _make_response(200, envelope)

            result = await adapter.get_profile("u1", token="tok")

        assert result["notification_email"] is True
        assert result["notification_sms"] is False
        assert result["notification_whatsapp"] is True
        assert "notification_preferences" not in result

    @pytest.mark.asyncio
    async def test_returns_body_as_is_when_no_data_key(self, adapter) -> None:
        """If UPS response has no ``data`` key, return as-is (backward compat)."""
        body = {"user_id": "u1", "full_name": "Alice"}
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client.get.return_value = _make_response(200, body)

            result = await adapter.get_profile("u1", token="tok")

        assert result == body
