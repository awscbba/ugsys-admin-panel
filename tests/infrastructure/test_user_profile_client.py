"""Unit tests for UserProfileClient — token forwarding and response handling."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from src.domain.exceptions import ExternalServiceError, NotFoundError
from src.infrastructure.adapters.user_profile_client import UserProfileClient


def _make_response(status_code: int, body: object | None = None) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.content = b"x" if body is not None else b""
    resp.json.return_value = body
    return resp


class TestHandleResponse:
    def test_returns_body_on_success(self) -> None:
        body = {"user_id": "u1", "display_name": "Alice"}
        resp = _make_response(200, body)
        result = UserProfileClient._handle_response(resp, "/api/v1/profiles/u1")
        assert result == body

    def test_unwraps_ups_envelope(self) -> None:
        """UPS returns {"data": {...}, "meta": {...}} — unwrap to inner data."""
        inner = {"user_id": "u1", "display_name": "Alice"}
        envelope = {"data": inner, "meta": {"request_id": "r1"}}
        resp = _make_response(200, envelope)
        result = UserProfileClient._handle_response(resp, "/api/v1/profiles/u1")
        assert result == inner
        assert "meta" not in result

    def test_returns_body_as_is_when_no_data_key(self) -> None:
        """If response has no ``data`` key, return as-is (backward compat)."""
        body = {"user_id": "u1", "display_name": "Alice"}
        resp = _make_response(200, body)
        result = UserProfileClient._handle_response(resp, "/api/v1/profiles/u1")
        assert result == body

    def test_returns_empty_dict_on_204(self) -> None:
        resp = _make_response(204)
        result = UserProfileClient._handle_response(resp, "/api/v1/profiles/u1")
        assert result == {}

    def test_raises_not_found_on_404(self) -> None:
        resp = _make_response(404, {"error": "not found"})
        with pytest.raises(NotFoundError):
            UserProfileClient._handle_response(resp, "/api/v1/profiles/u1")

    def test_raises_external_service_error_on_500(self) -> None:
        resp = _make_response(500, {"error": "internal"})
        with pytest.raises(ExternalServiceError):
            UserProfileClient._handle_response(resp, "/api/v1/profiles/u1")

    def test_raises_external_service_error_on_401(self) -> None:
        resp = _make_response(401, {"error": "unauthorized"})
        with pytest.raises(ExternalServiceError):
            UserProfileClient._handle_response(resp, "/api/v1/profiles/u1")

    def test_raises_external_service_error_on_malformed_json_body(self) -> None:
        """Regression: UPS returns 200 with non-JSON body → ExternalServiceError, not JSONDecodeError."""
        resp = MagicMock()
        resp.status_code = 200
        resp.is_success = True
        resp.content = b"not json"
        resp.json.side_effect = ValueError("Expecting value: line 1 column 1 (char 0)")
        with pytest.raises(ExternalServiceError, match=r"malformed.*JSON"):
            UserProfileClient._handle_response(resp, "/api/v1/profiles/u1")
