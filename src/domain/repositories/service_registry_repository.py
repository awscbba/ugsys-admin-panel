"""Service Registry repository port (ABC).

Defines the persistence contract for service registration entities.
Infrastructure adapters (e.g. DynamoDB) implement this interface.

Requirements: 4.2
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from src.domain.entities import ServiceRegistration


class ServiceRegistryRepository(ABC):
    """Abstract port for Service Registry persistence."""

    @abstractmethod
    async def save(self, registration: ServiceRegistration) -> None:
        """Persist a new or updated service registration."""

    @abstractmethod
    async def get_by_name(self, service_name: str) -> ServiceRegistration | None:
        """Retrieve a service registration by its unique name.

        Returns ``None`` if no registration exists for the given name.
        """

    @abstractmethod
    async def list_all(self) -> list[ServiceRegistration]:
        """Return every service registration in the registry."""

    @abstractmethod
    async def delete(self, service_name: str) -> None:
        """Remove a service registration by name.

        Raises ``NotFoundError`` if the service does not exist.
        """

    @abstractmethod
    async def upsert_seed(self, registration: ServiceRegistration) -> None:
        """Insert or update a seed-loaded service registration.

        Only writes if the entry does not exist or the seed version is
        newer than the stored version.
        """
