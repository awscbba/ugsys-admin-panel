"""User Management Service — enriched user list and role/status management.

Combines Identity Manager user data with User Profile Service profile data.
Uses circuit breakers on both external service calls.

Requirements: 9.1, 9.2, 9.4, 9.5, 9.6, 9.7
"""

from __future__ import annotations

import time
from typing import Any

import structlog

from src.domain.exceptions import AuthorizationError, ExternalServiceError
from src.domain.repositories.identity_client import IdentityClient
from src.domain.repositories.profile_client import ProfileClient
from src.domain.repositories.user_profile_service_client import UserProfileServiceClient
from src.domain.value_objects.role import AdminRole

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)


class UserManagementService:
    """Application service for admin user management.

    Parameters
    ----------
    identity_client:
        Port for Identity Manager operations (wrapped in circuit breaker).
    profile_client:
        Port for User Profile Service operations (wrapped in circuit breaker).
    """

    def __init__(
        self,
        identity_client: IdentityClient,
        profile_client: ProfileClient,
        ups_client: UserProfileServiceClient | None = None,
    ) -> None:
        self._identity = identity_client
        self._profile = profile_client
        self._ups = ups_client

    async def list_users(
        self,
        *,
        token: str,
        search: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        """Fetch paginated user list from Identity Manager, enriched with profiles.

        Requirements: 9.1, 9.2

        Parameters
        ----------
        token:
            Bearer token from the authenticated admin session, forwarded to
            upstream services.
        search:
            Optional search query (name, email).
        page:
            Page number (1-indexed).
        page_size:
            Number of users per page.

        Returns
        -------
        dict
            Paginated result with ``items``, ``total``, ``page``, ``page_size``.

        Raises
        ------
        ExternalServiceError
            When Identity Manager or User Profile Service is unavailable (Req 9.6).
        """
        # Fetch user list from Identity Manager (circuit breaker applied at adapter level).
        try:
            identity_result = await self._identity.list_users(
                token=token,
                search=search,
                page=page,
                page_size=page_size,
            )
        except ExternalServiceError:
            logger.error("user_management_identity_unavailable")
            raise

        # IdentityManagerClient unwraps {"data": [...]} → {"items": [...], "meta": {...}}
        users: list[dict[str, Any]] = identity_result.get("items", identity_result.get("users", []))
        meta: dict[str, Any] = identity_result.get("meta", {})
        total: int = meta.get("total", identity_result.get("total", len(users)))

        if not users:
            return {
                "items": [],
                "total": total,
                "page": page,
                "page_size": page_size,
            }

        # Enrich with profile data (Req 9.2).
        user_ids = [u.get("id") or u.get("user_id", "") for u in users]
        try:
            profiles = await self._profile.get_profiles(user_ids, token=token)
        except ExternalServiceError:
            logger.warning("user_management_profile_service_unavailable")
            profiles = {}

        enriched_users = []
        for user in users:
            uid = user.get("id") or user.get("user_id", "")
            profile = profiles.get(uid, {})
            enriched = {
                **user,
                "user_id": uid,  # normalize: frontend expects user_id
                "display_name": (
                    profile.get("display_name") or profile.get("name") or user.get("full_name") or user.get("email", "")
                ),
                "avatar": profile.get("avatar_url"),
            }
            enriched_users.append(enriched)

        return {
            "items": enriched_users,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    async def change_roles(
        self,
        user_id: str,
        roles: list[str],
        requesting_user_roles: list[str],
        *,
        token: str,
    ) -> None:
        """Change a user's roles (super_admin only).

        Requirements: 9.4
        """
        if AdminRole.SUPER_ADMIN.value not in requesting_user_roles:
            raise AuthorizationError(
                "Only super_admin users can change user roles.",
                error_code="FORBIDDEN",
            )

        try:
            await self._identity.update_roles(user_id, roles, token=token)
            logger.info("user_roles_changed", user_id=user_id, new_roles=roles)
        except ExternalServiceError:
            logger.error("user_management_role_change_failed", user_id=user_id)
            raise

    async def change_status(
        self,
        user_id: str,
        status: str,
        requesting_user_roles: list[str],
        *,
        token: str,
    ) -> None:
        """Activate or deactivate a user (super_admin, admin).

        Requirements: 9.5
        """
        allowed_roles = {AdminRole.SUPER_ADMIN.value, AdminRole.ADMIN.value}
        if not set(requesting_user_roles).intersection(allowed_roles):
            raise AuthorizationError(
                "Only super_admin or admin users can change user status.",
                error_code="FORBIDDEN",
            )

        try:
            await self._identity.update_status(user_id, status, token=token)
            logger.info("user_status_changed", user_id=user_id, new_status=status)
        except ExternalServiceError:
            logger.error("user_management_status_change_failed", user_id=user_id)
            raise

    async def update_profile(
        self,
        user_id: str,
        display_name: str | None,
        email: str | None,
        password: str | None,
        requesting_user_roles: list[str],
        *,
        token: str,
    ) -> None:
        """Update a user's profile fields and/or password (admin action).

        Role enforcement (server-side, regardless of client input):
        - ``display_name`` — editable by admin and super_admin
        - ``email`` — editable by super_admin only; silently discarded for admin
        - ``password`` — settable by super_admin only; silently discarded for admin

        Requirements: 10.1, 10.2, 10.3, 10.4
        """
        is_super_admin = AdminRole.SUPER_ADMIN.value in requesting_user_roles

        # Build profile fields dict — email stripped unless super_admin
        profile_fields: dict[str, str] = {}
        if display_name is not None:
            profile_fields["display_name"] = display_name
        if email is not None and is_super_admin:
            profile_fields["email"] = email

        # Password only for super_admin
        effective_password = password if is_super_admin else None

        fields_updated = list(profile_fields.keys())
        if effective_password:
            fields_updated.append("password")

        logger.info(
            "update_profile.started",
            user_id=user_id,
            fields_updated=fields_updated,
        )
        start = time.perf_counter()

        try:
            if profile_fields:
                await self._identity.update_profile(user_id, profile_fields, token=token)

            if effective_password:
                # Password MUST NOT appear in any log entry
                await self._identity.change_password(user_id, effective_password, token=token)

            logger.info(
                "update_profile.completed",
                user_id=user_id,
                fields_updated=fields_updated,
                duration_ms=round((time.perf_counter() - start) * 1000, 2),
            )
        except ExternalServiceError:
            logger.error(
                "update_profile.failed",
                user_id=user_id,
                duration_ms=round((time.perf_counter() - start) * 1000, 2),
            )
            raise

    # ------------------------------------------------------------------
    # UPS profile methods
    # ------------------------------------------------------------------

    async def get_ups_profile(
        self,
        user_id: str,
        *,
        token: str,
    ) -> dict[str, Any]:
        """Fetch the full UPS profile for a user.

        Requirements: 15.1, 15.2, 15.3
        """
        assert self._ups is not None, "ups_client not wired"
        logger.info("ups_profile.fetch.started", user_id=user_id)
        start = time.perf_counter()
        try:
            result = await self._ups.get_profile(user_id, token=token)
            logger.info(
                "ups_profile.fetch.completed",
                user_id=user_id,
                duration_ms=round((time.perf_counter() - start) * 1000, 2),
            )
            return result
        except ExternalServiceError:
            logger.error(
                "ups_profile.fetch.failed",
                user_id=user_id,
                duration_ms=round((time.perf_counter() - start) * 1000, 2),
            )
            raise

    async def update_ups_personal(
        self,
        user_id: str,
        fields: dict[str, Any],
        *,
        token: str,
    ) -> None:
        """Update UPS personal fields. Requirements: 15.1, 15.2, 15.3"""
        await self._ups_update(user_id, "personal", fields, token=token)

    async def update_ups_contact(
        self,
        user_id: str,
        fields: dict[str, Any],
        *,
        token: str,
    ) -> None:
        """Update UPS contact fields. Requirements: 15.1, 15.2, 15.3"""
        await self._ups_update(user_id, "contact", fields, token=token)

    async def update_ups_display(
        self,
        user_id: str,
        fields: dict[str, Any],
        *,
        token: str,
    ) -> None:
        """Update UPS display fields. Requirements: 15.1, 15.2, 15.3"""
        await self._ups_update(user_id, "display", fields, token=token)

    async def update_ups_preferences(
        self,
        user_id: str,
        fields: dict[str, Any],
        *,
        token: str,
    ) -> None:
        """Update UPS preference fields. Requirements: 15.1, 15.2, 15.3"""
        await self._ups_update(user_id, "preferences", fields, token=token)

    async def _ups_update(
        self,
        user_id: str,
        section: str,
        fields: dict[str, Any],
        *,
        token: str,
    ) -> None:
        assert self._ups is not None, "ups_client not wired"
        # Log user_id and section only — never field values (Req 15.3)
        logger.info("ups_profile.update.started", user_id=user_id, section=section)
        start = time.perf_counter()
        _update_fn = {
            "personal": self._ups.update_personal,
            "contact": self._ups.update_contact,
            "display": self._ups.update_display,
            "preferences": self._ups.update_preferences,
        }[section]
        try:
            await _update_fn(user_id, fields, token=token)
            logger.info(
                "ups_profile.update.completed",
                user_id=user_id,
                section=section,
                duration_ms=round((time.perf_counter() - start) * 1000, 2),
            )
        except ExternalServiceError:
            logger.error(
                "ups_profile.update.failed",
                user_id=user_id,
                section=section,
                duration_ms=round((time.perf_counter() - start) * 1000, 2),
            )
            raise
