"""Seed loader for pre-configured platform services.

Reads ``config/seed_services.json`` at BFF startup and upserts each
entry into the Service Registry.  Environment variable overrides of the
form ``SEED_{SERVICE_NAME}_BASE_URL`` (service name upper-cased, hyphens
replaced with underscores) take precedence over the JSON file values.

After upserting, the loader attempts to fetch and validate each service's
Plugin Manifest so that navigation entries are available immediately on
startup without requiring a manual re-registration call.

Requirements: 4.1, 4.2
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog

from src.application.interfaces.manifest_validator import validate_manifest
from src.domain.entities import ServiceRegistration
from src.domain.exceptions import ExternalServiceError, GatewayTimeoutError, ValidationError
from src.domain.repositories.service_registry_repository import ServiceRegistryRepository
from src.domain.value_objects import ServiceStatus
from src.infrastructure.adapters.manifest_fetcher import fetch_manifest

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
    now = datetime.now(UTC).isoformat()
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

    # --- Fetch manifests for all seed entries that have none ---
    # upsert_seed stores manifest=None; we now attempt to fetch each manifest
    # so navigation entries are populated without requiring a manual re-registration.
    await _refresh_missing_manifests(registry_repo)


async def _refresh_missing_manifests(registry_repo: ServiceRegistryRepository) -> None:
    """Fetch Plugin Manifests for any registered service that has none.

    Called once after the seed upsert loop.  Failures are logged and
    skipped — a missing manifest degrades gracefully (service stays
    registered but navigation entries won't appear until the next
    successful fetch).
    """
    try:
        all_services = await registry_repo.list_all()
    except Exception:
        logger.exception("seed_manifest_refresh_list_failed")
        return

    for svc in all_services:
        if svc.manifest is not None:
            continue  # already has a manifest — skip

        try:
            raw = await fetch_manifest(svc.manifest_url)
            manifest = validate_manifest(raw)
            now = datetime.now(UTC).isoformat()
            updated = ServiceRegistration(
                service_name=svc.service_name,
                base_url=svc.base_url,
                health_endpoint=svc.health_endpoint,
                manifest_url=svc.manifest_url,
                manifest=manifest,
                min_role=svc.min_role,
                status=ServiceStatus.ACTIVE,
                version=svc.version,
                registered_at=svc.registered_at,
                updated_at=now,
                registered_by=svc.registered_by,
                registration_source=svc.registration_source,
            )
            await registry_repo.save(updated)
            logger.info("seed_manifest_fetched", service_name=svc.service_name)
        except (GatewayTimeoutError, ExternalServiceError, ValidationError) as exc:
            logger.warning(
                "seed_manifest_fetch_failed",
                service_name=svc.service_name,
                error=str(exc),
            )
        except Exception:
            logger.exception("seed_manifest_fetch_error", service_name=svc.service_name)
