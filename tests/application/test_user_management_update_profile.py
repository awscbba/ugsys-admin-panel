"""Unit tests for UserManagementService.update_profile."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from src.application.services.user_management_service import UserManagementService
from src.domain.exceptions import ExternalServiceError
from src.domain.repositories.identity_client import IdentityClient
from src.domain.repositories.profile_client import ProfileClient

_TOKEN = "admin.jwt.token"


def _make_service() -> tuple[UserManagementService, AsyncMock, AsyncMock]:
    identity = AsyncMock(spec=IdentityClient)
    profile_mock = AsyncMock(spec=ProfileClient)
    svc = UserManagementService(identity_client=identity, profile_client=profile_mock)
    return svc, identity, profile_mock


class TestUpdateProfileDisplayNameOnly:
    """Admin role — only display_name is forwarded; email and password are stripped."""

    async def test_display_name_forwarded_for_admin(self) -> None:
        svc, identity, _ = _make_service()

        await svc.update_profile(
            "usr-1",
            display_name="Alice",
            email="alice@example.com",
            password="S3cr3t!",
            requesting_user_roles=["admin"],
            token=_TOKEN,
        )

        identity.update_profile.assert_awaited_once_with("usr-1", {"display_name": "Alice"}, token=_TOKEN)

    async def test_email_stripped_for_admin(self) -> None:
        svc, identity, _ = _make_service()

        await svc.update_profile(
            "usr-1",
            display_name="Alice",
            email="alice@example.com",
            password=None,
            requesting_user_roles=["admin"],
            token=_TOKEN,
        )

        called_fields = identity.update_profile.call_args[0][1]
        assert "email" not in called_fields

    async def test_password_stripped_for_admin(self) -> None:
        svc, identity, _ = _make_service()

        await svc.update_profile(
            "usr-1",
            display_name="Alice",
            email=None,
            password="S3cr3t!",
            requesting_user_roles=["admin"],
            token=_TOKEN,
        )

        identity.change_password.assert_not_awaited()


class TestUpdateProfileSuperAdmin:
    """super_admin role — all fields forwarded."""

    async def test_all_fields_forwarded_for_super_admin(self) -> None:
        svc, identity, _ = _make_service()

        await svc.update_profile(
            "usr-1",
            display_name="Bob",
            email="bob@example.com",
            password="N3wP@ss!",
            requesting_user_roles=["super_admin"],
            token=_TOKEN,
        )

        identity.update_profile.assert_awaited_once_with(
            "usr-1", {"display_name": "Bob", "email": "bob@example.com"}, token=_TOKEN
        )
        identity.change_password.assert_awaited_once_with("usr-1", "N3wP@ss!", token=_TOKEN)

    async def test_email_forwarded_for_super_admin(self) -> None:
        svc, identity, _ = _make_service()

        await svc.update_profile(
            "usr-1",
            display_name="Bob",
            email="bob@example.com",
            password=None,
            requesting_user_roles=["super_admin"],
            token=_TOKEN,
        )

        called_fields = identity.update_profile.call_args[0][1]
        assert called_fields["email"] == "bob@example.com"

    async def test_password_forwarded_for_super_admin(self) -> None:
        svc, identity, _ = _make_service()

        await svc.update_profile(
            "usr-1",
            display_name="Bob",
            email=None,
            password="N3wP@ss!",
            requesting_user_roles=["super_admin"],
            token=_TOKEN,
        )

        identity.change_password.assert_awaited_once_with("usr-1", "N3wP@ss!", token=_TOKEN)


class TestUpdateProfileErrorPropagation:
    """ExternalServiceError from identity client propagates to caller."""

    async def test_update_profile_failure_propagates(self) -> None:
        svc, identity, _ = _make_service()
        identity.update_profile.side_effect = ExternalServiceError("IM down")

        with pytest.raises(ExternalServiceError):
            await svc.update_profile(
                "usr-1",
                display_name="Alice",
                email=None,
                password=None,
                requesting_user_roles=["super_admin"],
                token=_TOKEN,
            )

    async def test_change_password_failure_propagates(self) -> None:
        svc, identity, _ = _make_service()
        identity.change_password.side_effect = ExternalServiceError("IM down")

        with pytest.raises(ExternalServiceError):
            await svc.update_profile(
                "usr-1",
                display_name="Alice",
                email=None,
                password="S3cr3t!",
                requesting_user_roles=["super_admin"],
                token=_TOKEN,
            )


class TestUpdateProfilePasswordNotLogged:
    """Password value must never appear in any structlog call."""

    async def test_password_not_in_log_calls(self) -> None:
        svc, _identity, _ = _make_service()
        secret = "SuperSecret99!"

        with patch("src.application.services.user_management_service.logger") as mock_logger:
            await svc.update_profile(
                "usr-1",
                display_name="Alice",
                email=None,
                password=secret,
                requesting_user_roles=["super_admin"],
                token=_TOKEN,
            )

        for log_call in mock_logger.info.call_args_list + mock_logger.error.call_args_list:
            all_args = str(log_call)
            assert secret not in all_args, f"Password leaked into log call: {log_call}"
