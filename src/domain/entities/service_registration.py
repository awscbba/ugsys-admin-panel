"""Service Registration entity for the Service Registry (Req 4.2)."""

from __future__ import annotations

from dataclasses import dataclass

from src.domain.entities.plugin_manifest import PluginManifest
from src.domain.value_objects import ServiceStatus


@dataclass
class ServiceRegistration:
    """A microservice registered with the Admin Panel.

    Persisted in the Service Registry DynamoDB table.
    ``registration_source`` distinguishes seed-loaded entries from
    runtime API registrations.
    """

    service_name: str
    base_url: str
    health_endpoint: str
    manifest_url: str
    manifest: PluginManifest | None
    min_role: str
    status: ServiceStatus
    version: int
    registered_at: str  # ISO 8601
    updated_at: str  # ISO 8601
    registered_by: str
    registration_source: str  # "seed" | "api"
