"""Unit tests for SelfProfileService.

Covers:
- display_name only update
- password only update
- both fields updated
- identity client failure propagation
- P2: password value never logged
"""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock

import pytest

from src.application.services.self_profile_service import SelfProfileService
from src.domain.exceptions import ExternalServiceError
from src.domain.repositories.identity_client import IdentityClient


def _make_identity_client() -> IdentityClient:
    client = AsyncMock(spec=IdentityClient)
    client.update_own_profile = AsyncMock(return_value=None)
    client.change_own_password = AsyncMock(return_value=None)
    return client


class TestUpdateOwnProfileDisplayNameOnly:
    async def test_calls_update_own_profile_only(self) -> None:
        """When only display_name is provided, only update_own_profile is called."""
        # Arrange
        identity = _make_identity_client()
        service = SelfProfileService(identity_client=identity)

        # Act
        await service.update_own_profile(
            user_id="usr-1",
            display_name="Alice",
            password=None,
            token="tok",
        )

        # Assert
        identity.update_own_profile.assert_awaited_once_with(
            "usr-1", {"display_name": "Alice"}, token="tok"
        )
        identity.change_own_password.assert_not_awaited()


class TestUpdateOwnProfilePasswordOnly:
    async def test_calls_change_own_password_only(self) -> None:
        """When only password is provided, only change_own_password is called."""
        # Arrange
        identity = _make_identity_client()
        service = SelfProfileService(identity_client=identity)

        # Act
        await service.update_own_profile(
            user_id="usr-1",
            display_name=None,
            password="S3cr3t!",
            token="tok",
        )

        # Assert
        identity.change_own_password.assert_awaited_once_with(
            "usr-1", "S3cr3t!", token="tok"
        )
        identity.update_own_profile.assert_not_awaited()


class TestUpdateOwnProfileBothFields:
    async def test_calls_both_methods_in_order(self) -> None:
        """When both fields are provided, display_name update runs before password change."""
        # Arrange
        call_order: list[str] = []
        identity = _make_identity_client()
        identity.update_own_profile.side_effect = lambda *a, **kw: call_order.append("profile") or None  # type: ignore[misc]
        identity.change_own_password.side_effect = lambda *a, **kw: call_order.append("password") or None  # type: ignore[misc]
        service = SelfProfileService(identity_client=identity)

        # Act
        await service.update_own_profile(
            user_id="usr-1",
            display_name="Bob",
            password="P@ssw0rd!",
            token="tok",
        )

        # Assert
        assert call_order == ["profile", "password"]
        identity.update_own_profile.assert_awaited_once()
        identity.change_own_password.assert_awaited_once()


class TestUpdateOwnProfileFailurePropagation:
    async def test_propagates_external_service_error_from_update_profile(self) -> None:
        """ExternalServiceError from update_own_profile propagates to caller."""
        # Arrange
        identity = _make_identity_client()
        identity.update_own_profile.side_effect = ExternalServiceError("IM down")
        service = SelfProfileService(identity_client=identity)

        # Act + Assert
        with pytest.raises(ExternalServiceError):
            await service.update_own_profile(
                user_id="usr-1",
                display_name="Alice",
                password=None,
                token="tok",
            )

    async def test_propagates_external_service_error_from_change_password(self) -> None:
        """ExternalServiceError from change_own_password propagates to caller."""
        # Arrange
        identity = _make_identity_client()
        identity.change_own_password.side_effect = ExternalServiceError("IM down")
        service = SelfProfileService(identity_client=identity)

        # Act + Assert
        with pytest.raises(ExternalServiceError):
            await service.update_own_profile(
                user_id="usr-1",
                display_name=None,
                password="S3cr3t!",
                token="tok",
            )


class TestPasswordNeverLogged:
    async def test_password_value_not_in_any_log_record(self) -> None:
        """P2 — password value must not appear in any structlog/logging record."""
        # Arrange
        identity = _make_identity_client()
        service = SelfProfileService(identity_client=identity)
        secret = "SuperSecret99!"
        captured_records: list[logging.LogRecord] = []

        class _Capture(logging.Handler):
            def emit(self, record: logging.LogRecord) -> None:
                captured_records.append(record)

        handler = _Capture()
        root_logger = logging.getLogger()
        root_logger.addHandler(handler)
        try:
            await service.update_own_profile(
                user_id="usr-1",
                display_name=None,
                password=secret,
                token="tok",
            )
        finally:
            root_logger.removeHandler(handler)

        # Assert — password must not appear in any log message
        for record in captured_records:
            assert secret not in record.getMessage(), (
                f"Password leaked into log record: {record.getMessage()}"
            )
