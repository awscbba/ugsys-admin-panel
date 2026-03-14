"""User Profile Service client port (ABC).

Defines the contract for fetching user profile data from the
User Profile Service.

Requirements: 1.3, 9.2
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ProfileClient(ABC):
    """Abstract port for the User Profile Service HTTP client."""

    @abstractmethod
    async def get_profile(self, user_id: str, *, token: str) -> dict[str, Any]:
        """Fetch a single user profile by ID.

        Parameters
        ----------
        token:
            Bearer token forwarded from the authenticated admin user's session.
        """

    @abstractmethod
    async def get_profiles(
        self,
        user_ids: list[str],
        *,
        token: str,
    ) -> dict[str, dict[str, Any]]:
        """Fetch multiple user profiles by their IDs.

        Returns a mapping of ``user_id → profile_data``.
        """
