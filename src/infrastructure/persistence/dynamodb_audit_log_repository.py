"""DynamoDB-backed Audit Log repository.

Table: ``ugsys-admin-audit-{env}``
PK: ``AUDIT#{ulid}``  SK: ``LOG``

GSI ``ActorIndex``:   PK ``actor_user_id``,  SK ``timestamp``
GSI ``ServiceIndex``: PK ``target_service``,  SK ``timestamp``

TTL attribute: ``ttl`` = Unix epoch of entry creation + 365 days.

Entries are immutable once written — no update or delete operations
are exposed (Req 11.7).

Requirements: 11.1, 11.4, 11.5, 11.7
"""

from __future__ import annotations

import base64
import json
import os
from datetime import datetime
from typing import Any

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError
from ulid import ULID

from src.domain.entities import AuditLogEntry
from src.domain.exceptions import RepositoryError
from src.domain.repositories.audit_log_repository import AuditLogRepository

_TTL_SECONDS = 365 * 24 * 3600  # 365 days in seconds


def _table_name() -> str:
    env = os.getenv("ENVIRONMENT", "dev")
    return f"ugsys-admin-audit-{env}"


def _pk(entry_id: str) -> str:
    return f"AUDIT#{entry_id}"


_SK = "LOG"


# ---------------------------------------------------------------------------
# TTL helpers
# ---------------------------------------------------------------------------


def _compute_ttl(timestamp_iso: str) -> int:
    """Return Unix epoch + 365 days for the given ISO 8601 timestamp."""
    dt = datetime.fromisoformat(timestamp_iso.replace("Z", "+00:00"))
    return int(dt.timestamp()) + _TTL_SECONDS


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------


def _to_item(entry: AuditLogEntry) -> dict[str, Any]:
    """Map a domain entity to a DynamoDB item dict."""
    return {
        "PK": _pk(entry.id),
        "SK": _SK,
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
        "ttl": _compute_ttl(entry.timestamp),
    }


def _from_item(item: dict[str, Any]) -> AuditLogEntry:
    """Reconstruct a domain entity from a DynamoDB item dict."""
    return AuditLogEntry(
        id=item["id"],
        timestamp=item["timestamp"],
        actor_user_id=item["actor_user_id"],
        actor_display_name=item["actor_display_name"],
        action=item["action"],
        target_service=item["target_service"],
        target_path=item["target_path"],
        http_method=item["http_method"],
        response_status=int(item["response_status"]),
        correlation_id=item["correlation_id"],
    )


# ---------------------------------------------------------------------------
# Pagination token helpers
# ---------------------------------------------------------------------------


def _encode_token(last_key: dict[str, Any]) -> str:
    """Base64-encode a DynamoDB LastEvaluatedKey as a pagination token."""
    return base64.urlsafe_b64encode(json.dumps(last_key).encode()).decode()


def _decode_token(token: str) -> dict[str, Any]:
    """Decode a pagination token back to a DynamoDB ExclusiveStartKey."""
    result: dict[str, Any] = json.loads(base64.urlsafe_b64decode(token.encode()).decode())
    return result


# ---------------------------------------------------------------------------
# Repository implementation
# ---------------------------------------------------------------------------


class DynamoDBAuditLogRepository(AuditLogRepository):
    """Concrete DynamoDB adapter for the Audit Log port (append-only)."""

    def __init__(self, dynamodb_resource: Any | None = None) -> None:
        resource = dynamodb_resource or boto3.resource("dynamodb")
        self._table = resource.Table(_table_name())

    # -- write ---------------------------------------------------------------

    async def save(self, entry: AuditLogEntry) -> None:
        """Persist an audit log entry.

        Generates a new ULID for the entry if ``entry.id`` is empty,
        then writes the item to DynamoDB.  Entries are immutable once
        written — this method only performs a ``put_item``.
        """
        if not entry.id:
            entry = AuditLogEntry(
                id=str(ULID()),
                timestamp=entry.timestamp,
                actor_user_id=entry.actor_user_id,
                actor_display_name=entry.actor_display_name,
                action=entry.action,
                target_service=entry.target_service,
                target_path=entry.target_path,
                http_method=entry.http_method,
                response_status=entry.response_status,
                correlation_id=entry.correlation_id,
            )
        try:
            self._table.put_item(Item=_to_item(entry))
        except ClientError as exc:
            raise RepositoryError(
                f"Failed to save audit log entry '{entry.id}'.",
            ) from exc

    # -- read ----------------------------------------------------------------

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

        Query strategy:
        - If ``actor_user_id`` is provided → use ``ActorIndex`` GSI
          (PK = actor_user_id, SK range on timestamp).
        - If ``target_service`` is provided → use ``ServiceIndex`` GSI
          (PK = target_service, SK range on timestamp).
        - Otherwise → scan the table with filter expressions.

        Additional filters (``http_method``, date range when not used as
        SK condition) are applied as DynamoDB FilterExpressions.

        Returns ``(entries, next_token)`` where ``next_token`` is an
        opaque base64-encoded pagination cursor or ``None`` when there
        are no more results.
        """
        try:
            if actor_user_id is not None:
                return await self._query_by_actor(
                    actor_user_id=actor_user_id,
                    start_date=start_date,
                    end_date=end_date,
                    http_method=http_method,
                    limit=limit,
                    next_token=next_token,
                )
            if target_service is not None:
                return await self._query_by_service(
                    target_service=target_service,
                    start_date=start_date,
                    end_date=end_date,
                    http_method=http_method,
                    limit=limit,
                    next_token=next_token,
                )
            return await self._scan_with_filters(
                start_date=start_date,
                end_date=end_date,
                http_method=http_method,
                limit=limit,
                next_token=next_token,
            )
        except ClientError as exc:
            raise RepositoryError("Failed to query audit log entries.") from exc

    # -- private query helpers -----------------------------------------------

    async def _query_by_actor(
        self,
        *,
        actor_user_id: str,
        start_date: str | None,
        end_date: str | None,
        http_method: str | None,
        limit: int,
        next_token: str | None,
    ) -> tuple[list[AuditLogEntry], str | None]:
        """Query via ActorIndex GSI."""
        key_condition = Key("actor_user_id").eq(actor_user_id)
        key_condition = _apply_timestamp_range(key_condition, start_date, end_date)

        kwargs: dict[str, Any] = {
            "IndexName": "ActorIndex",
            "KeyConditionExpression": key_condition,
            "Limit": limit,
            "ScanIndexForward": False,  # newest first
        }
        if http_method is not None:
            kwargs["FilterExpression"] = Attr("http_method").eq(http_method)
        if next_token is not None:
            kwargs["ExclusiveStartKey"] = _decode_token(next_token)

        response = self._table.query(**kwargs)
        return _build_result(response)

    async def _query_by_service(
        self,
        *,
        target_service: str,
        start_date: str | None,
        end_date: str | None,
        http_method: str | None,
        limit: int,
        next_token: str | None,
    ) -> tuple[list[AuditLogEntry], str | None]:
        """Query via ServiceIndex GSI."""
        key_condition = Key("target_service").eq(target_service)
        key_condition = _apply_timestamp_range(key_condition, start_date, end_date)

        kwargs: dict[str, Any] = {
            "IndexName": "ServiceIndex",
            "KeyConditionExpression": key_condition,
            "Limit": limit,
            "ScanIndexForward": False,
        }
        if http_method is not None:
            kwargs["FilterExpression"] = Attr("http_method").eq(http_method)
        if next_token is not None:
            kwargs["ExclusiveStartKey"] = _decode_token(next_token)

        response = self._table.query(**kwargs)
        return _build_result(response)

    async def _scan_with_filters(
        self,
        *,
        start_date: str | None,
        end_date: str | None,
        http_method: str | None,
        limit: int,
        next_token: str | None,
    ) -> tuple[list[AuditLogEntry], str | None]:
        """Full table scan with optional filter expressions."""
        filter_expr = Attr("SK").eq(_SK)

        if start_date is not None:
            filter_expr = filter_expr & Attr("timestamp").gte(start_date)
        if end_date is not None:
            filter_expr = filter_expr & Attr("timestamp").lte(end_date)
        if http_method is not None:
            filter_expr = filter_expr & Attr("http_method").eq(http_method)

        kwargs: dict[str, Any] = {
            "FilterExpression": filter_expr,
            "Limit": limit,
        }
        if next_token is not None:
            kwargs["ExclusiveStartKey"] = _decode_token(next_token)

        response = self._table.scan(**kwargs)
        return _build_result(response)


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


def _apply_timestamp_range(
    key_condition: Any,
    start_date: str | None,
    end_date: str | None,
) -> Any:
    """Append timestamp range conditions to a KeyConditionExpression."""
    if start_date is not None and end_date is not None:
        return key_condition & Key("timestamp").between(start_date, end_date)
    if start_date is not None:
        return key_condition & Key("timestamp").gte(start_date)
    if end_date is not None:
        return key_condition & Key("timestamp").lte(end_date)
    return key_condition


def _build_result(
    response: dict[str, Any],
) -> tuple[list[AuditLogEntry], str | None]:
    """Convert a DynamoDB response into ``(entries, next_token)``."""
    entries = [_from_item(item) for item in response.get("Items", [])]
    last_key = response.get("LastEvaluatedKey")
    token = _encode_token(last_key) if last_key else None
    return entries, token
