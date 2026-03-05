"""Audit Service — paginated, filterable audit log queries.

Provides read access to the immutable audit log. Write access is handled
by the AuditLoggingMiddleware.

Requirements: 11.2, 11.5
"""

from __future__ import annotations

from typing import Any

import structlog

from src.domain.entities.audit_log_entry import AuditLogEntry
from src.domain.repositories.audit_log_repository import AuditLogRepository

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)


class AuditService:
    """Application service for querying the audit log.

    Parameters
    ----------
    audit_log_repo:
        Port for reading audit log entries (append-only).
    """

    def __init__(self, audit_log_repo: AuditLogRepository) -> None:
        self._repo = audit_log_repo

    async def query_logs(
        self,
        *,
        start_date: str | None = None,
        end_date: str | None = None,
        actor_user_id: str | None = None,
        target_service: str | None = None,
        http_method: str | None = None,
        limit: int = 50,
        next_token: str | None = None,
    ) -> dict[str, Any]:
        """Query audit log entries with optional filters.

        Requirements: 11.2, 11.5

        Parameters
        ----------
        start_date:
            ISO 8601 start of date range filter.
        end_date:
            ISO 8601 end of date range filter.
        actor_user_id:
            Filter by actor user ID.
        target_service:
            Filter by target service name.
        http_method:
            Filter by HTTP method (POST, PUT, PATCH, DELETE).
        limit:
            Maximum number of entries to return (default: 50).
        next_token:
            Opaque pagination cursor from a previous query.

        Returns
        -------
        dict
            ``{"entries": [...], "next_token": str | None}``
        """
        entries, next_page_token = await self._repo.query(
            start_date=start_date,
            end_date=end_date,
            actor_user_id=actor_user_id,
            target_service=target_service,
            http_method=http_method,
            limit=limit,
            next_token=next_token,
        )

        return {
            "entries": [_entry_to_dict(e) for e in entries],
            "next_token": next_page_token,
        }


def _entry_to_dict(entry: AuditLogEntry) -> dict[str, Any]:
    """Convert an AuditLogEntry to a serializable dict."""
    return {
        "id": entry.id,
        "timestamp": entry.timestamp,
        "actor_user_id": entry.actor_user_id,
        "actor_display_name": entry.actor_display_name,
        "action": entry.action,
        "target_service": entry.target_service,
        "target_path": entry.target_path,
        "http_method": entry.http_method,
        "response_status": entry.response_status,
        "correlation_id": entry.correlation_id,
    }
