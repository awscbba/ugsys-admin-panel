"""Seed loader for pre-configured platform services.

Reads ``config/seed_services.json`` at BFF startup and upserts each
entry into the Service Registry.  Environment variable overrides of the
form ``SEED_{SERVICE_NAME}_BASE_URL`` (service name upper-cased, hyphens
replaced with underscores) take precedence over the JSON file values.

Requirements: 4.1, 4.2
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

from src.domain.entities import ServiceRegistration
from src.domain.repositories.service_registry_repository import ServiceRegistryRepository
from src.domain.value_objects import ServiceStatus

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)


def _env_var_name(service_name: str) -> str:
    """Derive the environment variable name for a service's base URL override.

    ``identity-manager`` → ``SEED_IDENTITY_MANAGER_BASE_URL``
    """
    return f"SEED_{service_name.upper().replace('-', '_')}_BASE_URL"


def _resolve_base_url(service_name: str, default_base_url: str) -> str:
    """Return the environment-overridden base URL or the default."""
    env_key = _env_var_name(service_name)
    override = os.environ.get(env_key)
    if override:
        logger.info(
            "seed_base_url_override",
            service_name=service_name,
            env_var=env_key,
        )
        return override
    return default_base_url


def _build_registration(entry: dict[str, Any], seed_version: int) -> ServiceRegistration:
    """Convert a single seed JSON entry into a ``ServiceRegistration``."""
    now = datetime.now(timezone.utc).isoformat()
    service_name: str = entry["service_name"]
    base_url = _resolve_base_url(service_name, entry["base_url"])

    return ServiceRegistration(
        service_name=service_name,
        base_url=base_url,
        health_endpoint=entry["health_endpoint"],
        manifest_url=entry["manifest_url"],
        manifest=None,
        min_role=entry["min_role"],
        status=ServiceStatus.ACTIVE,
        version=seed_version,
        registered_at=now,
        updated_at=now,
        registered_by="seed",
        registration_source="seed",
    )


async def load_seed_services(
    registry_repo: ServiceRegistryRepository,
    config_path: str | Path = "config/seed_services.json",
) -> None:
    """Load seed services from *config_path* into the Service Registry.

    For each service entry the loader:

    1. Checks for an environment variable override
       ``SEED_{SERVICE_NAME}_BASE_URL``.
    2. Builds a :class:`ServiceRegistration` with
       ``registration_source="seed"``.
    3. Calls :meth:`ServiceRegistryRepository.upsert_seed` which only
       writes when the entry is missing or the seed version is newer.

    Parameters
    ----------
    registry_repo:
        The repository port used to persist registrations.
    config_path:
        Filesystem path to the seed JSON file.  Defaults to
        ``config/seed_services.json`` relative to the working directory.
    """
    path = Path(config_path)
    if not path.exists():
        logger.warning("seed_config_not_found", path=str(path))
        return

    try:
        raw = path.read_text(encoding="utf-8")
        data: dict[str, Any] = json.loads(raw)
    except (json.JSONDecodeError, OSError) as exc:
        logger.error("seed_config_read_error", path=str(path), error=str(exc))
        return

    seed_version: int = data.get("version", 1)
    services: list[dict[str, Any]] = data.get("services", [])

    if not services:
        logger.info("seed_config_empty", path=str(path))
        return

    logger.info(
        "seed_loading_started",
        service_count=len(services),
        seed_version=seed_version,
    )

    for entry in services:
        service_name = entry.get("service_name", "<unknown>")
        try:
            registration = _build_registration(entry, seed_version)
            await registry_repo.upsert_seed(registration)
            logger.info("seed_service_upserted", service_name=service_name)
        except Exception:
            logger.exception("seed_service_upsert_failed", service_name=service_name)

    logger.info("seed_loading_completed", service_count=len(services))
