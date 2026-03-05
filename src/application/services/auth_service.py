"""Auth Service — login, logout, token refresh, and current user enrichment.

Orchestrates authentication flows between the BFF and the Identity Manager,
and enriches the current user with profile data from the User Profile Service.

Requirements: 2.1, 2.4, 2.5, 2.7
"""

from __future__ import annotations

from typing import Any

import structlog

from src.domain.entities.admin_user import AdminUser
from src.domain.exceptions import ExternalServiceError
from src.domain.repositories.identity_client import IdentityClient
from src.domain.repositories.profile_client import ProfileClient
from src.domain.value_objects.role import AdminRole

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)


class AuthService:
    """Application service for authentication and session management.

    Parameters
    ----------
    identity_client:
        Port for communicating with the Identity Manager.
    profile_client:
        Port for fetching user profile data.
    """

    def __init__(
        self,
        identity_client: IdentityClient,
        profile_client: ProfileClient,
    ) -> None:
        self._identity = identity_client
        self._profile = profile_client

    async def login(self, email: str, password: str) -> dict[str, Any]:
        """Forward credentials to the Identity Manager and return the token pair.

        Parameters
        ----------
        email:
            Admin user's email address.
        password:
            Admin user's password (never logged).

        Returns
        -------
        dict
            Token pair with ``access_token``, ``refresh_token``, and
            ``expires_in`` fields as returned by the Identity Manager.

        Raises
        ------
        AuthenticationError
            When the Identity Manager rejects the credentials.
        ExternalServiceError
            When the Identity Manager is unreachable.
        """
        logger.info("auth_login_attempt", email_domain=email.split("@")[-1] if "@" in email else "unknown")
        token_pair: dict[str, Any] = await self._identity.authenticate(email, password)
        logger.info("auth_login_success")
        return token_pair

    async def logout(self, token: str) -> None:
        """Invalidate the session on the Identity Manager side.

        Parameters
        ----------
        token:
            The access token to invalidate (never logged).

        Raises
        ------
        ExternalServiceError
            When the Identity Manager is unreachable.
        """
        logger.info("auth_logout")
        await self._identity.logout(token)

    async def refresh(self, refresh_token: str) -> dict[str, Any]:
        """Exchange a refresh token for a new token pair.

        Parameters
        ----------
        refresh_token:
            The refresh token (never logged).

        Returns
        -------
        dict
            New token pair with ``access_token``, ``refresh_token``, and
            ``expires_in`` fields.

        Raises
        ------
        AuthenticationError
            When the refresh token is expired or invalid (HTTP 401 from
            the Identity Manager).
        ExternalServiceError
            When the Identity Manager is unreachable.
        """
        logger.info("auth_token_refresh")
        token_pair: dict[str, Any] = await self._identity.refresh_token(refresh_token)
        logger.info("auth_token_refresh_success")
        return token_pair

    async def get_current_user(self, user_id: str, email: str, raw_roles: list[str]) -> AdminUser:
        """Build an enriched AdminUser from JWT claims and profile data.

        Fetches the user's display name and avatar from the User Profile
        Service.  If the profile service is unavailable the user is still
        returned with the email as the display name fallback.

        Parameters
        ----------
        user_id:
            JWT ``sub`` claim.
        email:
            JWT ``email`` claim.
        raw_roles:
            JWT ``roles`` claim as a list of strings.

        Returns
        -------
        AdminUser
            Enriched admin user entity.
        """
        # Map raw role strings to AdminRole enum values; ignore unknown roles.
        roles: list[AdminRole] = []
        for r in raw_roles:
            try:
                roles.append(AdminRole(r))
            except ValueError:
                pass

        # Attempt profile enrichment; fall back gracefully on failure.
        display_name = email
        avatar_url: str | None = None
        try:
            profile = await self._profile.get_profile(user_id)
            display_name = profile.get("display_name") or profile.get("name") or email
            avatar_url = profile.get("avatar_url")
        except (ExternalServiceError, Exception):
            logger.warning("auth_profile_enrichment_failed", user_id=user_id)

        return AdminUser(
            user_id=user_id,
            email=email,
            roles=roles,
            display_name=display_name,
            avatar_url=avatar_url,
        )
