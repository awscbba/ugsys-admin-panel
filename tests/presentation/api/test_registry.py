"""Unit tests for GET /api/v1/registry/services — manifest included in response.

Covers:
- _to_response() includes manifest navigation/routes when manifest is present
- _to_response() returns manifest=None when no manifest
- has_config_schema is True only when manifest.config_schema is set
- NavigationEntryResponse fields are correctly mapped from domain value object
"""

from __future__ import annotations

from src.domain.entities.plugin_manifest import PluginManifest
from src.domain.entities.service_registration import ServiceRegistration
from src.domain.value_objects.navigation_entry import NavigationEntry
from src.domain.value_objects.route_descriptor import RouteDescriptor
from src.domain.value_objects.service_status import ServiceStatus
from src.presentation.api.v1.registry import _to_response


def _make_registration(manifest: PluginManifest | None = None) -> ServiceRegistration:
    return ServiceRegistration(
        service_name="projects-registry",
        base_url="https://api.apps.cloud.org.bo",
        health_endpoint="/health",
        manifest_url="https://api.apps.cloud.org.bo/plugin-manifest.json",
        manifest=manifest,
        min_role="moderator",
        status=ServiceStatus.ACTIVE,
        version=1,
        registered_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
        registered_by="seed",
        registration_source="seed",
    )


def _make_manifest(with_config_schema: bool = False) -> PluginManifest:
    return PluginManifest(
        name="projects-registry",
        version="0.1.0",
        entry_point="https://api.apps.cloud.org.bo/admin/remoteEntry.js",
        routes=[
            RouteDescriptor(
                path="/app/projects-registry/projects",
                required_roles=("moderator", "admin"),
                label="Projects",
            )
        ],
        navigation=[
            NavigationEntry(
                label="Projects",
                icon="📋",
                path="/app/projects-registry/projects",
                required_roles=("moderator", "admin"),
                group="Registry",
                order=1,
            )
        ],
        config_schema={"type": "object", "properties": {}} if with_config_schema else None,
    )


class TestToResponseNoManifest:
    def test_manifest_is_none(self) -> None:
        reg = _make_registration(manifest=None)
        resp = _to_response(reg)
        assert resp.manifest is None

    def test_has_manifest_false(self) -> None:
        reg = _make_registration(manifest=None)
        resp = _to_response(reg)
        assert resp.has_manifest is False

    def test_has_config_schema_false(self) -> None:
        reg = _make_registration(manifest=None)
        resp = _to_response(reg)
        assert resp.has_config_schema is False


class TestToResponseWithManifest:
    def test_manifest_is_not_none(self) -> None:
        reg = _make_registration(manifest=_make_manifest())
        resp = _to_response(reg)
        assert resp.manifest is not None

    def test_has_manifest_true(self) -> None:
        reg = _make_registration(manifest=_make_manifest())
        resp = _to_response(reg)
        assert resp.has_manifest is True

    def test_entry_point_mapped(self) -> None:
        reg = _make_registration(manifest=_make_manifest())
        resp = _to_response(reg)
        assert resp.manifest is not None
        assert resp.manifest.entryPoint == "https://api.apps.cloud.org.bo/admin/remoteEntry.js"

    def test_navigation_entry_mapped(self) -> None:
        reg = _make_registration(manifest=_make_manifest())
        resp = _to_response(reg)
        assert resp.manifest is not None
        assert len(resp.manifest.navigation) == 1
        nav = resp.manifest.navigation[0]
        assert nav.label == "Projects"
        assert nav.icon == "📋"
        assert nav.path == "/app/projects-registry/projects"
        assert nav.required_roles == ["moderator", "admin"]
        assert nav.group == "Registry"
        assert nav.order == 1

    def test_route_mapped(self) -> None:
        reg = _make_registration(manifest=_make_manifest())
        resp = _to_response(reg)
        assert resp.manifest is not None
        assert len(resp.manifest.routes) == 1
        route = resp.manifest.routes[0]
        assert route.path == "/app/projects-registry/projects"
        assert route.required_roles == ["moderator", "admin"]
        assert route.label == "Projects"

    def test_has_config_schema_false_when_no_schema(self) -> None:
        reg = _make_registration(manifest=_make_manifest(with_config_schema=False))
        resp = _to_response(reg)
        assert resp.has_config_schema is False

    def test_has_config_schema_true_when_schema_present(self) -> None:
        reg = _make_registration(manifest=_make_manifest(with_config_schema=True))
        resp = _to_response(reg)
        assert resp.has_config_schema is True
        assert resp.manifest is not None
        assert resp.manifest.configSchema is not None
