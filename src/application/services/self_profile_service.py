"""SelfProfileService — application service for self-service profile updates.

Orchestrates sequential calls to the IdentityClient port to update the
authenticated user's own display name and/or password.

Security invariants:
- ``user_id`` is always derived from the JWT sub claim — never from client input.
- ``password`` value MUST NEVER appear in any log entry at any level (P2).
- Fields are only forwarded to the Identity Manager when non-None (diff-only).

Requirements: topbar-user-profile-dropdown P1, P2, P5
"""

from __future__ import annotations

import time

import structlog

from src.domain.repositories.identity_client import IdentityClient

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)


class SelfProfileService:
    """Orchestrates self-service profile updates via the IdentityClient port."""

    def __init__(self, identity_client: IdentityClient) -> None:
        self._identity = identity_client

    async def update_own_profile(
        self,
        *,
        user_id: str,
        display_name: str | None,
        password: str | None,
        token: str,
    ) -> None:
        """Update the caller's own display name and/or password.

        Calls are made sequentially:
        1. ``update_own_profile`` (display_name) — only when ``display_name`` is not None.
        2. ``change_own_password`` (password) — only when ``password`` is not None.

        Parameters
        ----------
        user_id:
            The authenticated user's ID, derived from the JWT ``sub`` claim.
            MUST NOT originate from client-supplied request body.
        display_name:
            New display name, or ``None`` to skip this update.
        password:
            New password, or ``None`` to skip this update.
            MUST NEVER be logged at any level.
        token:
            The caller's Bearer token, forwarded to the Identity Manager.
        """
        fields_to_update: list[str] = []
        if display_name is not None:
            fields_to_update.append("display_name")
        if password is not None:
            fields_to_update.append("password")

        logger.info(
            "update_own_profile.started",
            user_id=user_id,
            fields=fields_to_update,  # field names only — never values
        )
        start = time.perf_counter()

        fields_updated: list[str] = []

        if display_name is not None:
            await self._identity.update_own_profile(
                user_id,
                {"display_name": display_name},
                token=token,
            )
            fields_updated.append("display_name")

        if password is not None:
            # password value is passed directly — NEVER logged here or downstream
            await self._identity.change_own_password(user_id, password, token=token)
            fields_updated.append("password")

        logger.info(
            "update_own_profile.completed",
            user_id=user_id,
            fields_updated=fields_updated,
            duration_ms=round((time.perf_counter() - start) * 1000, 2),
        )
