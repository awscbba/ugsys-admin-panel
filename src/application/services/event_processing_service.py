"""Event Processing Service — handle platform events from EventBridge.

Subscriptions:
- identity.user.role_changed → invalidate cached role/user data (Req 12.2)
- identity.auth.login_failed → flag suspicious activity >10 failures/hour (Req 12.3)

Behavior:
- Idempotent processing: same event multiple times → same result (Req 12.5)
- Failed event processing → log failure, continue processing (Req 12.6)

Requirements: 12.1, 12.2, 12.3, 12.5, 12.6
"""

from __future__ import annotations

import datetime
from collections import defaultdict
from typing import Any

import structlog

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

# Suspicious activity threshold: >10 failures per hour per user (Req 12.3).
_SUSPICIOUS_FAILURE_THRESHOLD = 10
_SUSPICIOUS_WINDOW_SECONDS = 3600  # 1 hour


class EventProcessingService:
    """Handles incoming platform events from the event bus.

    Maintains in-memory state for:
    - Invalidated user cache entries (role_changed events)
    - Login failure counts per user (login_failed events)
    - Suspicious user flags

    In a production deployment these would be backed by a distributed
    cache (e.g. ElastiCache), but for MVP in-memory state is sufficient.

    Parameters
    ----------
    None — all state is in-memory.
    """

    def __init__(self) -> None:
        # Set of user IDs whose cached data has been invalidated.
        self._invalidated_users: set[str] = set()
        # Processed event IDs for idempotency (Req 12.5).
        self._processed_event_ids: set[str] = set()
        # Login failure timestamps per user: user_id → list of ISO timestamps.
        self._login_failures: dict[str, list[str]] = defaultdict(list)
        # Flagged suspicious users: user_id → flag timestamp.
        self._suspicious_users: dict[str, str] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def process_event(self, event: dict[str, Any]) -> None:
        """Route an incoming event to the appropriate handler.

        Idempotent: events with the same ID are processed only once (Req 12.5).
        Failed processing is logged and does not block subsequent events (Req 12.6).

        Parameters
        ----------
        event:
            EventBridge event dict with ``detail-type``, ``detail``, and
            optionally ``id`` fields.
        """
        event_id: str = event.get("id", "")
        event_type: str = event.get("detail-type", event.get("event_type", ""))
        detail: dict[str, Any] = event.get("detail", event.get("payload", {}))

        # Idempotency check (Req 12.5).
        if event_id and event_id in self._processed_event_ids:
            logger.debug("event_already_processed", event_id=event_id, event_type=event_type)
            return

        try:
            await self._dispatch(event_type, detail)
        except Exception as exc:
            # Log failure and continue (Req 12.6).
            logger.error(
                "event_processing_failed",
                event_type=event_type,
                event_id=event_id,
                error=str(exc),
            )
            return

        # Mark as processed after successful handling (Req 12.5).
        if event_id:
            self._processed_event_ids.add(event_id)

    def is_user_cache_invalidated(self, user_id: str) -> bool:
        """Return True if the user's cached data has been invalidated."""
        return user_id in self._invalidated_users

    def clear_user_cache_invalidation(self, user_id: str) -> None:
        """Clear the invalidation flag after the cache has been refreshed."""
        self._invalidated_users.discard(user_id)

    def is_user_suspicious(self, user_id: str) -> bool:
        """Return True if the user has been flagged for suspicious activity."""
        return user_id in self._suspicious_users

    def get_suspicious_users(self) -> dict[str, str]:
        """Return all flagged suspicious users with their flag timestamps."""
        return dict(self._suspicious_users)

    # ------------------------------------------------------------------
    # Private dispatch
    # ------------------------------------------------------------------

    async def _dispatch(self, event_type: str, detail: dict[str, Any]) -> None:
        """Route event to the appropriate handler."""
        if event_type == "identity.user.role_changed":
            await self._handle_role_changed(detail)
        elif event_type == "identity.auth.login_failed":
            await self._handle_login_failed(detail)
        elif event_type in (
            "identity.user.created",
            "identity.user.updated",
            "identity.user.deleted",
        ):
            # Log receipt; no specific action required for MVP.
            logger.info("event_received", event_type=event_type)
        else:
            logger.debug("event_unhandled", event_type=event_type)

    async def _handle_role_changed(self, detail: dict[str, Any]) -> None:
        """Invalidate cached role/user data for the affected user (Req 12.2)."""
        user_id: str = detail.get("user_id", "")
        if not user_id:
            logger.warning("role_changed_event_missing_user_id")
            return

        self._invalidated_users.add(user_id)
        logger.info("user_cache_invalidated", user_id=user_id)

    async def _handle_login_failed(self, detail: dict[str, Any]) -> None:
        """Track login failures and flag suspicious activity (Req 12.3).

        Flags a user when they have more than 10 failures within 1 hour.
        """
        user_id: str = detail.get("user_id", "")
        if not user_id:
            logger.warning("login_failed_event_missing_user_id")
            return

        now = datetime.datetime.now(datetime.UTC)
        now_iso = now.isoformat()
        cutoff = (now - datetime.timedelta(seconds=_SUSPICIOUS_WINDOW_SECONDS)).isoformat()

        # Add this failure timestamp.
        self._login_failures[user_id].append(now_iso)

        # Evict failures outside the 1-hour window.
        self._login_failures[user_id] = [ts for ts in self._login_failures[user_id] if ts >= cutoff]

        failure_count = len(self._login_failures[user_id])
        logger.debug(
            "login_failure_tracked",
            user_id=user_id,
            failure_count=failure_count,
        )

        # Flag as suspicious if threshold exceeded (Req 12.3).
        if failure_count > _SUSPICIOUS_FAILURE_THRESHOLD:
            if user_id not in self._suspicious_users:
                self._suspicious_users[user_id] = now_iso
                logger.warning(
                    "suspicious_login_activity_flagged",
                    user_id=user_id,
                    failure_count=failure_count,
                )
