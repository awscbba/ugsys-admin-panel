"""Identity Manager client port (ABC).

Defines the contract for communicating with the Identity Manager
service for authentication, token management, and user operations.

Requirements: 2.1, 9.2, 9.4, 9.5
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class IdentityClient(ABC):
    """Abstract port for the Identity Manager HTTP client."""

    @abstractmethod
    async def authenticate(
        self,
        email: str,
        password: str,
    ) -> dict[str, Any]:
        """Forward login credentials to the Identity Manager.

        Returns the token pair (access + refresh) on success.
        """

    @abstractmethod
    async def refresh_token(self, refresh_token: str) -> dict[str, Any]:
        """Exchange a refresh token for a new token pair."""

    @abstractmethod
    async def logout(self, token: str) -> None:
        """Invalidate the session on the Identity Manager side."""

    @abstractmethod
    async def list_users(
        self,
        *,
        token: str,
        search: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        """Fetch a paginated user list from the Identity Manager.

        Parameters
        ----------
        token:
            Bearer token forwarded from the authenticated admin user's session.
            Required — the Identity Manager enforces authentication on this endpoint.
        """

    @abstractmethod
    async def update_roles(
        self,
        user_id: str,
        roles: list[str],
        *,
        token: str,
    ) -> None:
        """Change a user's roles via the Identity Manager."""

    @abstractmethod
    async def update_status(
        self,
        user_id: str,
        status: str,
        *,
        token: str,
    ) -> None:
        """Activate or deactivate a user via the Identity Manager."""

    @abstractmethod
    async def update_own_profile(
        self,
        user_id: str,
        fields: dict[str, str],
        *,
        token: str,
    ) -> None:
        """Update the authenticated user's own profile fields (e.g. display_name).

        Distinct from update_roles/update_status (admin-on-other-user).
        ``token`` is the caller's own Bearer token — forwarded as-is.
        """

    @abstractmethod
    async def change_own_password(
        self,
        user_id: str,
        new_password: str,
        *,
        token: str,
    ) -> None:
        """Change the authenticated user's own password.

        ``new_password`` MUST NEVER appear in any log entry at any level.
        ``token`` is the caller's own Bearer token — forwarded as-is.
        """
