"""Audit Log repository port (ABC).

Defines the persistence contract for immutable audit log entries.
No update or delete operations are permitted (Req 11.7).

Requirements: 11.1, 11.4, 11.5, 11.7
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from src.domain.entities import AuditLogEntry


class AuditLogRepository(ABC):
    """Abstract port for Audit Log persistence (append-only)."""

    @abstractmethod
    async def save(self, entry: AuditLogEntry) -> None:
        """Persist an audit log entry.

        Entries are immutable once written — no update or delete is
        supported by this interface.
        """

    @abstractmethod
    async def query(
        self,
        *,
        start_date: str | None = None,
        end_date: str | None = None,
        actor_user_id: str | None = None,
        target_service: str | None = None,
        http_method: str | None = None,
        limit: int = 50,
        next_token: str | None = None,
    ) -> tuple[list[AuditLogEntry], str | None]:
        """Query audit log entries with optional filters.

        Supports filtering by date range, actor user ID, target service,
        and HTTP method.  Returns a tuple of ``(entries, next_token)``
        for pagination.
        """
