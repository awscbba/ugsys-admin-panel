"""Unit tests for the seed loader — manifest fetch behaviour."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from src.domain.entities import ServiceRegistration
from src.domain.exceptions import ExternalServiceError
from src.domain.value_objects import ServiceStatus
from src.infrastructure.seed.seed_loader import load_seed_services

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_seed_config(version: int = 3) -> dict[str, Any]:
    return {
        "version": version,
        "services": [
            {
                "service_name": "user-profile-service",
                "base_url": "https://profiles.apps.cloud.org.bo",
                "health_endpoint": "/health",
                "manifest_url": "https://profiles.apps.cloud.org.bo/plugin-manifest.json",
                "min_role": "admin",
            }
        ],
    }


def _make_registration(manifest: Any = None) -> ServiceRegistration:
    return ServiceRegistration(
        service_name="user-profile-service",
        base_url="https://profiles.apps.cloud.org.bo",
        health_endpoint="/health",
        manifest_url="https://profiles.apps.cloud.org.bo/plugin-manifest.json",
        manifest=manifest,
        min_role="admin",
        status=ServiceStatus.ACTIVE,
        version=3,
        registered_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-01T00:00:00+00:00",
        registered_by="seed",
        registration_source="seed",
    )


_VALID_MANIFEST: dict[str, Any] = {
    "name": "user-profile-service",
    "version": "0.1.0",
    "entryPoint": "https://profiles.apps.cloud.org.bo/assets/index.js",
    "healthEndpoint": "/health",
    "routes": [{"path": "/users", "requiredRoles": ["admin", "super_admin"], "label": "Users"}],
    "navigation": [
        {
            "label": "Users",
            "icon": "👤",
            "path": "/users",
            "requiredRoles": ["admin", "super_admin"],
            "group": "Users",
            "order": 1,
        }
    ],
}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestSeedLoaderManifestFetch:
    """Seed loader fetches manifests for entries that have none."""

    @pytest.mark.asyncio
    async def test_fetches_manifest_for_null_manifest_entry(self, tmp_path: Path) -> None:
        """After upserting, loader fetches manifest and saves updated entry."""
        config_file = tmp_path / "seed.json"
        config_file.write_text(json.dumps(_make_seed_config()))

        repo = AsyncMock()
        repo.upsert_seed = AsyncMock()
        repo.list_all = AsyncMock(return_value=[_make_registration(manifest=None)])
        repo.save = AsyncMock()

        with patch(
            "src.infrastructure.seed.seed_loader.fetch_manifest",
            new=AsyncMock(return_value=_VALID_MANIFEST),
        ):
            await load_seed_services(repo, config_path=config_file)

        repo.save.assert_called_once()
        saved: ServiceRegistration = repo.save.call_args[0][0]
        assert saved.manifest is not None
        assert saved.manifest.name == "user-profile-service"
        assert len(saved.manifest.navigation) == 1
        assert saved.manifest.navigation[0].label == "Users"

    @pytest.mark.asyncio
    async def test_skips_entry_that_already_has_manifest(self, tmp_path: Path) -> None:
        """Entries with an existing manifest are not re-fetched."""
        config_file = tmp_path / "seed.json"
        config_file.write_text(json.dumps(_make_seed_config()))

        from src.application.interfaces.manifest_validator import validate_manifest

        existing_manifest = validate_manifest(_VALID_MANIFEST)
        repo = AsyncMock()
        repo.upsert_seed = AsyncMock()
        repo.list_all = AsyncMock(return_value=[_make_registration(manifest=existing_manifest)])
        repo.save = AsyncMock()

        with patch(
            "src.infrastructure.seed.seed_loader.fetch_manifest",
            new=AsyncMock(return_value=_VALID_MANIFEST),
        ) as mock_fetch:
            await load_seed_services(repo, config_path=config_file)

        mock_fetch.assert_not_called()
        repo.save.assert_not_called()

    @pytest.mark.asyncio
    async def test_manifest_fetch_failure_does_not_raise(self, tmp_path: Path) -> None:
        """A failed manifest fetch is logged and skipped — does not abort startup."""
        config_file = tmp_path / "seed.json"
        config_file.write_text(json.dumps(_make_seed_config()))

        repo = AsyncMock()
        repo.upsert_seed = AsyncMock()
        repo.list_all = AsyncMock(return_value=[_make_registration(manifest=None)])
        repo.save = AsyncMock()

        with patch(
            "src.infrastructure.seed.seed_loader.fetch_manifest",
            new=AsyncMock(side_effect=ExternalServiceError("timeout")),
        ):
            # Must not raise
            await load_seed_services(repo, config_path=config_file)

        repo.save.assert_not_called()

    @pytest.mark.asyncio
    async def test_missing_config_file_does_not_raise(self, tmp_path: Path) -> None:
        """Missing seed config is handled gracefully."""
        repo = AsyncMock()
        await load_seed_services(repo, config_path=tmp_path / "nonexistent.json")
        repo.upsert_seed.assert_not_called()
        repo.save.assert_not_called()

    @pytest.mark.asyncio
    async def test_list_all_failure_does_not_raise(self, tmp_path: Path) -> None:
        """If list_all fails during manifest refresh, startup continues."""
        config_file = tmp_path / "seed.json"
        config_file.write_text(json.dumps(_make_seed_config()))

        repo = AsyncMock()
        repo.upsert_seed = AsyncMock()
        repo.list_all = AsyncMock(side_effect=Exception("DynamoDB unavailable"))
        repo.save = AsyncMock()

        await load_seed_services(repo, config_path=config_file)

        repo.save.assert_not_called()
