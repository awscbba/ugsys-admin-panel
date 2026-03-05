"""Audit Log Entry entity for the immutable audit trail (Req 11.3)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AuditLogEntry:
    """An immutable record of an administrative action.

    Created by the audit logging middleware for every state-changing
    request (POST, PUT, PATCH, DELETE) that passes through the BFF Proxy.
    Persisted in the Audit Log DynamoDB table with a 365-day TTL.
    """

    id: str  # ULID
    timestamp: str  # ISO 8601
    actor_user_id: str
    actor_display_name: str
    action: str
    target_service: str
    target_path: str
    http_method: str
    response_status: int
    correlation_id: str
