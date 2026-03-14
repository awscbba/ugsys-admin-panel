"""Unit tests for UserManagementService — token forwarding and enrichment."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from src.application.services.user_management_service import UserManagementService
from src.domain.exceptions import AuthorizationError, ExternalServiceError
from src.domain.repositories.identity_client import IdentityClient
from src.domain.repositories.profile_client import ProfileClient

_TOKEN = "test.jwt.token"


def _make_service() -> tuple[UserManagementService, AsyncMock, AsyncMock]:
    identity = AsyncMock(spec=IdentityClient)
    profile_mock = AsyncMock(spec=ProfileClient)
    svc = UserManagementService(identity_client=identity, profile_client=profile_mock)
    return svc, identity, profile_mock


class TestListUsers:
    async def test_forwards_token_to_identity_client(self) -> None:
        svc, identity, _ = _make_service()
        identity.list_users.return_value = {"users": [], "total": 0}

        await svc.list_users(token=_TOKEN, page=1, page_size=20)

        identity.list_users.assert_called_once_with(token=_TOKEN, search=None, page=1, page_size=20)

    async def test_forwards_token_to_profile_client(self) -> None:
        svc, identity, profile_mock = _make_service()
        identity.list_users.return_value = {
            "users": [{"id": "u1", "email": "a@b.com"}],
            "total": 1,
        }
        profile_mock.get_profiles.return_value = {}

        await svc.list_users(token=_TOKEN)

        profile_mock.get_profiles.assert_called_once_with(["u1"], token=_TOKEN)

    async def test_returns_empty_list_when_no_users(self) -> None:
        svc, identity, _ = _make_service()
        identity.list_users.return_value = {"users": [], "total": 0}

        result = await svc.list_users(token=_TOKEN)

        assert result["users"] == []
        assert result["total"] == 0

    async def test_enriches_users_with_profile_display_name(self) -> None:
        svc, identity, profile_mock = _make_service()
        identity.list_users.return_value = {
            "users": [{"id": "u1", "email": "a@b.com"}],
            "total": 1,
        }
        profile_mock.get_profiles.return_value = {"u1": {"display_name": "Alice"}}

        result = await svc.list_users(token=_TOKEN)

        assert result["users"][0]["display_name"] == "Alice"

    async def test_falls_back_to_email_when_profile_unavailable(self) -> None:
        svc, identity, profile_mock = _make_service()
        identity.list_users.return_value = {
            "users": [{"id": "u1", "email": "a@b.com"}],
            "total": 1,
        }
        profile_mock.get_profiles.side_effect = ExternalServiceError("down")

        result = await svc.list_users(token=_TOKEN)

        assert result["users"][0]["display_name"] == "a@b.com"

    async def test_raises_when_identity_unavailable(self) -> None:
        svc, identity, _ = _make_service()
        identity.list_users.side_effect = ExternalServiceError("down")

        with pytest.raises(ExternalServiceError):
            await svc.list_users(token=_TOKEN)


class TestChangeRoles:
    async def test_forwards_token_to_identity_client(self) -> None:
        svc, identity, _ = _make_service()

        await svc.change_roles("u1", ["admin"], requesting_user_roles=["super_admin"], token=_TOKEN)

        identity.update_roles.assert_called_once_with("u1", ["admin"], token=_TOKEN)

    async def test_raises_authorization_error_when_not_super_admin(self) -> None:
        svc, identity, _ = _make_service()

        with pytest.raises(AuthorizationError):
            await svc.change_roles("u1", ["admin"], requesting_user_roles=["admin"], token=_TOKEN)

        identity.update_roles.assert_not_called()


class TestChangeStatus:
    async def test_forwards_token_to_identity_client(self) -> None:
        svc, identity, _ = _make_service()

        await svc.change_status("u1", "inactive", requesting_user_roles=["admin"], token=_TOKEN)

        identity.update_status.assert_called_once_with("u1", "inactive", token=_TOKEN)

    async def test_raises_authorization_error_when_insufficient_role(self) -> None:
        svc, identity, _ = _make_service()

        with pytest.raises(AuthorizationError):
            await svc.change_status("u1", "inactive", requesting_user_roles=["viewer"], token=_TOKEN)

        identity.update_status.assert_not_called()
