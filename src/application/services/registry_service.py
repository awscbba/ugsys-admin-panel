"""Registry Service — service registration, discovery, and deregistration.

Orchestrates the Service Registry lifecycle:
- Validates S2S JWT or super_admin authorization
- Fetches and validates Plugin Manifests
- Persists registrations in the Service Registry
- Emits domain events on registration/deregistration
- Filters service list by user roles

Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
"""

from __future__ import annotations

import datetime
from typing import Any

import structlog

from src.application.interfaces.manifest_validator import validate_manifest
from src.domain.entities.service_registration import ServiceRegistration
from src.domain.exceptions import (
    AuthorizationError,
    ExternalServiceError,
    GatewayTimeoutError,
    NotFoundError,
    ValidationError,
)
from src.domain.repositories.event_publisher import EventPublisher
from src.domain.repositories.service_registry_repository import ServiceRegistryRepository
from src.domain.value_objects.role import AdminRole
from src.domain.value_objects.service_status import ServiceStatus
from src.infrastructure.adapters.manifest_fetcher import fetch_manifest

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

# Role hierarchy for min_role filtering.
_ROLE_HIERARCHY: dict[str, int] = {
    "super_admin": 4,
    "admin": 3,
    "moderator": 2,
    "auditor": 1,
    "member": 0,
    "guest": 0,
    "system": 0,
}


def _user_satisfies_min_role(user_roles: list[str], min_role: str) -> bool:
    """Return True if any of the user's roles meets or exceeds min_role."""
    min_level = _ROLE_HIERARCHY.get(min_role, 0)
    return any(_ROLE_HIERARCHY.get(r, 0) >= min_level for r in user_roles)


class RegistryService:
    """Application service for Service Registry management.

    Parameters
    ----------
    registry_repo:
        Port for persisting service registrations.
    event_publisher:
        Port for emitting domain events.
    """

    def __init__(
        self,
        registry_repo: ServiceRegistryRepository,
        event_publisher: EventPublisher,
    ) -> None:
        self._repo = registry_repo
        self._events = event_publisher

    async def register_service(
        self,
        service_name: str,
        base_url: str,
        health_endpoint: str,
        manifest_url: str,
        min_role: str,
        registered_by: str,
        registration_source: str = "api",
    ) -> ServiceRegistration:
        """Register or update a service in the registry.

        Fetches and validates the Plugin Manifest from the declared URL.
        If the manifest URL is unreachable or returns invalid JSON, the
        service is marked as ``degraded`` (Req 4.6).

        Emits ``admin.service.registered`` on success (Req 4.8).

        Parameters
        ----------
        service_name:
            Unique service identifier.
        base_url:
            Service base URL.
        health_endpoint:
            Relative health endpoint path.
        manifest_url:
            URL to the Plugin Manifest JSON.
        min_role:
            Minimum role required to see this service.
        registered_by:
            Client ID or user ID performing the registration.
        registration_source:
            ``"api"`` for runtime registrations, ``"seed"`` for seed entries.

        Returns
        -------
        ServiceRegistration
            The persisted registration entity.
        """
        now = datetime.datetime.now(datetime.UTC).isoformat()

        # Check if service already exists to determine version.
        existing = await self._repo.get_by_name(service_name)
        version = (existing.version + 1) if existing else 1

        # Attempt to fetch and validate the Plugin Manifest.
        manifest = None
        status = ServiceStatus.ACTIVE
        try:
            raw_manifest = await fetch_manifest(manifest_url)
            manifest = validate_manifest(raw_manifest)
            logger.info("registry_manifest_fetched", service_name=service_name)
        except (GatewayTimeoutError, ExternalServiceError, ValidationError) as exc:
            # Mark as degraded when manifest is unreachable or invalid (Req 4.6).
            status = ServiceStatus.DEGRADED
            logger.warning(
                "registry_manifest_fetch_failed",
                service_name=service_name,
                error=str(exc),
            )

        registration = ServiceRegistration(
            service_name=service_name,
            base_url=base_url,
            health_endpoint=health_endpoint,
            manifest_url=manifest_url,
            manifest=manifest,
            min_role=min_role,
            status=status,
            version=version,
            registered_at=existing.registered_at if existing else now,
            updated_at=now,
            registered_by=registered_by,
            registration_source=registration_source,
        )

        await self._repo.save(registration)
        logger.info(
            "registry_service_registered",
            service_name=service_name,
            version=version,
            status=status.value,
        )

        # Emit domain event (Req 4.8).
        await self._events.publish(
            "admin.service.registered",
            {
                "service_name": service_name,
                "version": version,
                "status": status.value,
                "registered_by": registered_by,
            },
        )

        return registration

    async def list_services(self, user_roles: list[str]) -> list[ServiceRegistration]:
        """Return services whose min_role is satisfied by the user's roles.

        Requirements: 4.4
        """
        all_services = await self._repo.list_all()
        return [svc for svc in all_services if _user_satisfies_min_role(user_roles, svc.min_role)]

    async def deregister_service(
        self,
        service_name: str,
        user_roles: list[str],
        force: bool = False,
    ) -> None:
        """Remove a service from the registry.

        Only ``super_admin`` users may deregister services (Req 4.7).
        Seed entries require ``force=True`` to delete (Req 4.5).

        Emits ``admin.service.deregistered`` on success (Req 4.8).

        Parameters
        ----------
        service_name:
            Service to deregister.
        user_roles:
            Roles of the requesting user.
        force:
            When ``True``, allows deletion of seed entries.

        Raises
        ------
        AuthorizationError
            When the user is not a super_admin.
        AuthorizationError
            When attempting to delete a seed entry without force=True.
        NotFoundError
            When the service does not exist.
        """
        # Enforce super_admin only (Req 4.7).
        if AdminRole.SUPER_ADMIN.value not in user_roles:
            raise AuthorizationError(
                "Only super_admin users can deregister services.",
                error_code="FORBIDDEN",
            )

        registration = await self._repo.get_by_name(service_name)
        if registration is None:
            raise NotFoundError(f"Service '{service_name}' not found in registry.")

        # Block seed entry deletion without force flag (Req 4.5).
        if registration.registration_source == "seed" and not force:
            raise AuthorizationError(
                f"Service '{service_name}' is a seed entry and cannot be deleted without force=true.",
                error_code="FORBIDDEN",
            )

        await self._repo.delete(service_name)
        logger.info("registry_service_deregistered", service_name=service_name)

        # Emit domain event (Req 4.8).
        await self._events.publish(
            "admin.service.deregistered",
            {"service_name": service_name},
        )

    async def get_config_schema(self, service_name: str) -> dict[str, Any] | None:
        """Return the stored configSchema for a service.

        Requirements: 4.1, 10.1

        Returns
        -------
        dict or None
            The JSON Schema dict from the Plugin Manifest, or ``None`` if
            the service has no configSchema.

        Raises
        ------
        NotFoundError
            When the service does not exist.
        """
        registration = await self._repo.get_by_name(service_name)
        if registration is None:
            raise NotFoundError(f"Service '{service_name}' not found in registry.")

        if registration.manifest is None:
            return None

        return registration.manifest.config_schema
