"""User Profile Service client port (ABC) — write operations.

Defines the contract for reading and mutating UPS profile data from the
User Profile Service. This is distinct from ``ProfileClient`` which only
handles read operations for the enriched user list.

Requirements: 11.1, 11.2, 11.3
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class UserProfileServiceClient(ABC):
    """Abstract port for UPS profile read/write operations."""

    @abstractmethod
    async def get_profile(self, user_id: str, *, token: str) -> dict[str, Any]:
        """Fetch the full UPS profile for a user.

        Parameters
        ----------
        user_id:
            The target user's ID.
        token:
            Bearer token forwarded from the authenticated admin session.

        Returns
        -------
        dict
            Parsed JSON profile data.

        Raises
        ------
        NotFoundError
            When the profile does not exist (HTTP 404).
        ExternalServiceError
            When the service is unavailable or the circuit breaker is open.
        """

    @abstractmethod
    async def update_personal(
        self,
        user_id: str,
        fields: dict[str, Any],
        *,
        token: str,
    ) -> None:
        """PATCH personal fields (full_name, date_of_birth).

        Raises
        ------
        NotFoundError
            When the profile does not exist.
        ExternalServiceError
            When the service is unavailable.
        """

    @abstractmethod
    async def update_contact(
        self,
        user_id: str,
        fields: dict[str, Any],
        *,
        token: str,
    ) -> None:
        """PATCH contact fields (phone, street, city, state, postal_code, country).

        Raises
        ------
        NotFoundError
            When the profile does not exist.
        ExternalServiceError
            When the service is unavailable.
        """

    @abstractmethod
    async def update_display(
        self,
        user_id: str,
        fields: dict[str, Any],
        *,
        token: str,
    ) -> None:
        """PATCH display fields (bio, display_name).

        Raises
        ------
        NotFoundError
            When the profile does not exist.
        ExternalServiceError
            When the service is unavailable.
        """

    @abstractmethod
    async def update_preferences(
        self,
        user_id: str,
        fields: dict[str, Any],
        *,
        token: str,
    ) -> None:
        """PATCH preference fields (notification_email, notification_sms,
        notification_whatsapp, language, timezone).

        Raises
        ------
        NotFoundError
            When the profile does not exist.
        ExternalServiceError
            When the service is unavailable.
        """
