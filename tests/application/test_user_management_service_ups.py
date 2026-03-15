"""Unit tests for UserManagementService UPS methods.

TDD RED phase — written before the implementation.

Requirements: 15.1, 15.2, 15.3
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from src.application.services.user_management_service import UserManagementService
from src.domain.exceptions import ExternalServiceError
from src.domain.repositories.user_profile_service_client import UserProfileServiceClient

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_service() -> tuple[UserManagementService, AsyncMock, AsyncMock, AsyncMock]:
    """Return (service, identity_mock, profile_mock, ups_mock)."""
    identity = AsyncMock()
    profile = AsyncMock()
    ups = AsyncMock(spec=UserProfileServiceClient)

    from src.domain.repositories.identity_client import IdentityClient
    from src.domain.repositories.profile_client import ProfileClient

    identity.__class__ = IdentityClient
    profile.__class__ = ProfileClient

    svc = UserManagementService(
        identity_client=identity,
        profile_client=profile,
        ups_client=ups,
    )
    return svc, identity, profile, ups


# ---------------------------------------------------------------------------
# get_ups_profile
# ---------------------------------------------------------------------------


class TestGetUpsProfile:
    @pytest.mark.asyncio
    async def test_delegates_to_ups_client(self) -> None:
        svc, _, _, ups = _make_service()
        ups.get_profile.return_value = {"user_id": "u1", "full_name": "Alice"}

        result = await svc.get_ups_profile("u1", token="tok")

        ups.get_profile.assert_awaited_once_with("u1", token="tok")
        assert result == {"user_id": "u1", "full_name": "Alice"}

    @pytest.mark.asyncio
    async def test_logs_started_and_completed(self) -> None:
        svc, _, _, ups = _make_service()
        ups.get_profile.return_value = {"user_id": "u1"}

        with patch("src.application.services.user_management_service.logger") as mock_log:
            await svc.get_ups_profile("u1", token="tok")

        log_calls = [c[0][0] for c in mock_log.info.call_args_list]
        assert any("started" in ev for ev in log_calls)
        assert any("completed" in ev for ev in log_calls)

    @pytest.mark.asyncio
    async def test_logs_user_id_not_field_values(self) -> None:
        svc, _, _, ups = _make_service()
        ups.get_profile.return_value = {"user_id": "u1", "full_name": "SECRET"}

        with patch("src.application.services.user_management_service.logger") as mock_log:
            await svc.get_ups_profile("u1", token="tok")

        # Flatten all log kwargs
        all_kwargs: dict[str, object] = {}
        for c in mock_log.info.call_args_list:
            all_kwargs.update(c[1])
        assert "user_id" in all_kwargs
        # Field values must NOT appear in logs
        assert "full_name" not in all_kwargs
        assert "SECRET" not in str(all_kwargs)

    @pytest.mark.asyncio
    async def test_logs_failed_with_duration_ms_on_error(self) -> None:
        svc, _, _, ups = _make_service()
        ups.get_profile.side_effect = ExternalServiceError("UPS down")

        with (
            patch("src.application.services.user_management_service.logger") as mock_log,
            pytest.raises(ExternalServiceError),
        ):
            await svc.get_ups_profile("u1", token="tok")

        error_calls = list(mock_log.error.call_args_list)
        assert len(error_calls) >= 1
        # duration_ms must be present in the error log
        error_kwargs = error_calls[0][1]
        assert "duration_ms" in error_kwargs


# ---------------------------------------------------------------------------
# update_ups_personal
# ---------------------------------------------------------------------------


class TestUpdateUpsPersonal:
    @pytest.mark.asyncio
    async def test_delegates_to_ups_client(self) -> None:
        svc, _, _, ups = _make_service()
        fields = {"full_name": "Alice"}

        await svc.update_ups_personal("u1", fields, token="tok")

        ups.update_personal.assert_awaited_once_with("u1", fields, token="tok")

    @pytest.mark.asyncio
    async def test_logs_started_completed_with_section(self) -> None:
        svc, _, _, _ups = _make_service()

        with patch("src.application.services.user_management_service.logger") as mock_log:
            await svc.update_ups_personal("u1", {}, token="tok")

        log_calls = [c[0][0] for c in mock_log.info.call_args_list]
        assert any("started" in ev for ev in log_calls)
        assert any("completed" in ev for ev in log_calls)
        # section must be logged
        all_kwargs: dict[str, object] = {}
        for c in mock_log.info.call_args_list:
            all_kwargs.update(c[1])
        assert all_kwargs.get("section") == "personal"

    @pytest.mark.asyncio
    async def test_no_field_values_in_logs(self) -> None:
        svc, _, _, _ups = _make_service()
        fields = {"full_name": "SENSITIVE_VALUE"}

        with patch("src.application.services.user_management_service.logger") as mock_log:
            await svc.update_ups_personal("u1", fields, token="tok")

        all_log_str = str(mock_log.info.call_args_list)
        assert "SENSITIVE_VALUE" not in all_log_str

    @pytest.mark.asyncio
    async def test_logs_failed_on_error(self) -> None:
        svc, _, _, ups = _make_service()
        ups.update_personal.side_effect = ExternalServiceError("UPS down")

        with (
            patch("src.application.services.user_management_service.logger") as mock_log,
            pytest.raises(ExternalServiceError),
        ):
            await svc.update_ups_personal("u1", {}, token="tok")

        error_calls = mock_log.error.call_args_list
        assert len(error_calls) >= 1
        assert "duration_ms" in error_calls[0][1]


# ---------------------------------------------------------------------------
# update_ups_contact
# ---------------------------------------------------------------------------


class TestUpdateUpsContact:
    @pytest.mark.asyncio
    async def test_delegates_to_ups_client(self) -> None:
        svc, _, _, ups = _make_service()
        fields = {"phone": "+591"}

        await svc.update_ups_contact("u1", fields, token="tok")

        ups.update_contact.assert_awaited_once_with("u1", fields, token="tok")

    @pytest.mark.asyncio
    async def test_logs_section_contact(self) -> None:
        svc, _, _, _ups = _make_service()

        with patch("src.application.services.user_management_service.logger") as mock_log:
            await svc.update_ups_contact("u1", {}, token="tok")

        all_kwargs: dict[str, object] = {}
        for c in mock_log.info.call_args_list:
            all_kwargs.update(c[1])
        assert all_kwargs.get("section") == "contact"


# ---------------------------------------------------------------------------
# update_ups_display
# ---------------------------------------------------------------------------


class TestUpdateUpsDisplay:
    @pytest.mark.asyncio
    async def test_delegates_to_ups_client(self) -> None:
        svc, _, _, ups = _make_service()
        fields = {"bio": "Hello"}

        await svc.update_ups_display("u1", fields, token="tok")

        ups.update_display.assert_awaited_once_with("u1", fields, token="tok")

    @pytest.mark.asyncio
    async def test_logs_section_display(self) -> None:
        svc, _, _, _ups = _make_service()

        with patch("src.application.services.user_management_service.logger") as mock_log:
            await svc.update_ups_display("u1", {}, token="tok")

        all_kwargs: dict[str, object] = {}
        for c in mock_log.info.call_args_list:
            all_kwargs.update(c[1])
        assert all_kwargs.get("section") == "display"


# ---------------------------------------------------------------------------
# update_ups_preferences
# ---------------------------------------------------------------------------


class TestUpdateUpsPreferences:
    @pytest.mark.asyncio
    async def test_delegates_to_ups_client(self) -> None:
        svc, _, _, ups = _make_service()
        fields = {"language": "es"}

        await svc.update_ups_preferences("u1", fields, token="tok")

        ups.update_preferences.assert_awaited_once_with("u1", fields, token="tok")

    @pytest.mark.asyncio
    async def test_logs_section_preferences(self) -> None:
        svc, _, _, _ups = _make_service()

        with patch("src.application.services.user_management_service.logger") as mock_log:
            await svc.update_ups_preferences("u1", {}, token="tok")

        all_kwargs: dict[str, object] = {}
        for c in mock_log.info.call_args_list:
            all_kwargs.update(c[1])
        assert all_kwargs.get("section") == "preferences"
