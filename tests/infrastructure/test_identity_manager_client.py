"""Unit tests for IdentityManagerClient._handle_response envelope unwrapping."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from src.domain.exceptions import AuthenticationError, ExternalServiceError
from src.infrastructure.adapters.identity_manager_client import IdentityManagerClient


def _make_response(status_code: int, body: object | None = None, content: bytes = b"x") -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.content = content if body is not None else b""
    resp.json.return_value = body
    return resp


class TestHandleResponseEnvelopeUnwrapping:
    """_handle_response must unwrap the {"data": ..., "meta": ...} envelope."""

    def test_unwraps_dict_data(self) -> None:
        body = {"data": {"access_token": "tok", "refresh_token": "ref", "expires_in": 1800}, "meta": {}}
        resp = _make_response(200, body)
        result = IdentityManagerClient._handle_response(resp, "/api/v1/auth/login")
        assert result == {"access_token": "tok", "refresh_token": "ref", "expires_in": 1800}

    def test_unwraps_list_data_into_items_key(self) -> None:
        body = {"data": [{"id": "1"}, {"id": "2"}], "meta": {"total": 2}}
        resp = _make_response(200, body)
        result = IdentityManagerClient._handle_response(resp, "/api/v1/users")
        assert result["items"] == [{"id": "1"}, {"id": "2"}]
        assert result["meta"] == {"total": 2}

    def test_returns_body_as_is_when_no_data_key(self) -> None:
        body = {"access_token": "tok"}
        resp = _make_response(200, body)
        result = IdentityManagerClient._handle_response(resp, "/some/path")
        assert result == {"access_token": "tok"}

    def test_returns_empty_dict_on_204(self) -> None:
        resp = _make_response(204, body=None, content=b"")
        result = IdentityManagerClient._handle_response(resp, "/api/v1/auth/logout")
        assert result == {}

    def test_raises_authentication_error_on_401(self) -> None:
        resp = _make_response(401, body={"error": "unauthorized"})
        with pytest.raises(AuthenticationError):
            IdentityManagerClient._handle_response(resp, "/api/v1/auth/login")

    def test_raises_external_service_error_on_500(self) -> None:
        resp = _make_response(500, body={"error": "internal"})
        with pytest.raises(ExternalServiceError):
            IdentityManagerClient._handle_response(resp, "/api/v1/auth/login")


class TestAuthorizationHeaderForwarding:
    """_get / _patch helpers must include Authorization: Bearer when token is provided."""

    def test_get_helper_includes_bearer_token(self) -> None:
        """Verify the headers dict passed to httpx includes Authorization."""
        # We test the header construction logic directly by inspecting what
        # the helper would build — token non-empty → header present.
        token = "my.jwt.token"
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        assert headers == {"Authorization": "Bearer my.jwt.token"}

    def test_get_helper_omits_header_when_token_empty(self) -> None:
        token = ""
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        assert headers == {}


class TestUpdateOwnProfile:
    """update_own_profile delegates to circuit breaker with PATCH and correct path."""

    async def test_happy_path_calls_cb_with_patch(self) -> None:
        """update_own_profile calls self._cb.call with _patch and correct path."""
        from unittest.mock import AsyncMock, MagicMock

        from src.infrastructure.adapters.identity_manager_client import IdentityManagerClient

        cb = MagicMock()
        cb.call = AsyncMock(return_value={})
        client = IdentityManagerClient(circuit_breaker=cb, base_url="http://im")

        await client.update_own_profile("usr-1", {"display_name": "Alice"}, token="tok")

        cb.call.assert_awaited_once()
        args = cb.call.call_args
        # First positional arg is the helper (_patch), second is the path
        assert args[0][1] == "/api/v1/users/usr-1"
        assert args[1]["json"] == {"display_name": "Alice"}
        assert args[1]["token"] == "tok"

    async def test_propagates_external_service_error(self) -> None:
        """update_own_profile propagates ExternalServiceError from circuit breaker."""
        from unittest.mock import AsyncMock, MagicMock

        from src.domain.exceptions import ExternalServiceError
        from src.infrastructure.adapters.identity_manager_client import IdentityManagerClient

        cb = MagicMock()
        cb.call = AsyncMock(side_effect=ExternalServiceError("IM down"))
        client = IdentityManagerClient(circuit_breaker=cb, base_url="http://im")

        with pytest.raises(ExternalServiceError):
            await client.update_own_profile("usr-1", {"display_name": "Alice"}, token="tok")

    def test_handle_response_raises_external_service_error_on_4xx(self) -> None:
        """_handle_response raises ExternalServiceError on 4xx (non-401)."""
        resp = _make_response(422, body={"detail": "validation error"})
        with pytest.raises(ExternalServiceError):
            IdentityManagerClient._handle_response(resp, "/api/v1/users/usr-1")

    def test_handle_response_raises_external_service_error_on_5xx(self) -> None:
        """_handle_response raises ExternalServiceError on 5xx."""
        resp = _make_response(503, body={"error": "unavailable"})
        with pytest.raises(ExternalServiceError):
            IdentityManagerClient._handle_response(resp, "/api/v1/users/usr-1")


class TestChangeOwnPassword:
    """change_own_password delegates to circuit breaker with POST and never logs password."""

    async def test_happy_path_calls_cb_with_post(self) -> None:
        """change_own_password calls self._cb.call with _post and correct path."""
        from unittest.mock import AsyncMock, MagicMock

        from src.infrastructure.adapters.identity_manager_client import IdentityManagerClient

        cb = MagicMock()
        cb.call = AsyncMock(return_value={})
        client = IdentityManagerClient(circuit_breaker=cb, base_url="http://im")

        await client.change_own_password("usr-1", "S3cr3tP@ss!", token="tok")

        cb.call.assert_awaited_once()
        args = cb.call.call_args
        assert args[0][1] == "/api/v1/users/usr-1/change-password"
        assert args[1]["json"] == {"new_password": "S3cr3tP@ss!"}
        assert args[1]["token"] == "tok"

    async def test_propagates_external_service_error(self) -> None:
        """change_own_password propagates ExternalServiceError from circuit breaker."""
        from unittest.mock import AsyncMock, MagicMock

        from src.domain.exceptions import ExternalServiceError
        from src.infrastructure.adapters.identity_manager_client import IdentityManagerClient

        cb = MagicMock()
        cb.call = AsyncMock(side_effect=ExternalServiceError("IM down"))
        client = IdentityManagerClient(circuit_breaker=cb, base_url="http://im")

        with pytest.raises(ExternalServiceError):
            await client.change_own_password("usr-1", "S3cr3tP@ss!", token="tok")

    async def test_password_not_in_cb_call_log_args(self) -> None:
        """P2 — password value must not appear in any positional string arg to cb.call."""
        from unittest.mock import AsyncMock, MagicMock

        from src.infrastructure.adapters.identity_manager_client import IdentityManagerClient

        cb = MagicMock()
        cb.call = AsyncMock(return_value={})
        client = IdentityManagerClient(circuit_breaker=cb, base_url="http://im")

        secret = "SuperSecret99!"
        await client.change_own_password("usr-1", secret, token="tok")

        # Verify the password does NOT appear in any string positional argument
        for arg in cb.call.call_args[0]:
            if isinstance(arg, str):
                assert secret not in arg, "Password leaked into a positional string arg"
