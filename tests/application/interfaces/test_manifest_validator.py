"""Unit tests for Plugin Manifest JSON Schema validator."""

from __future__ import annotations

from typing import Any

import pytest

from src.application.interfaces.manifest_validator import validate_manifest
from src.domain.entities import PluginManifest
from src.domain.exceptions import ValidationError


def _minimal_manifest(**overrides: Any) -> dict[str, Any]:
    """Return a minimal valid manifest dict, with optional overrides."""
    base: dict[str, Any] = {
        "name": "test-service",
        "version": "1.0.0",
        "entryPoint": "https://example.com/bundle.js",
        "routes": [
            {"path": "/dashboard", "requiredRoles": ["admin"], "label": "Dashboard"},
        ],
        "navigation": [
            {
                "label": "Dashboard",
                "icon": "dashboard",
                "path": "/dashboard",
                "requiredRoles": ["admin"],
            },
        ],
    }
    base.update(overrides)
    return base


class TestValidateManifestHappyPath:
    """Tests for valid manifests that should parse successfully."""

    def test_minimal_valid_manifest(self) -> None:
        result = validate_manifest(_minimal_manifest())

        assert isinstance(result, PluginManifest)
        assert result.name == "test-service"
        assert result.version == "1.0.0"
        assert result.entry_point == "https://example.com/bundle.js"

    def test_routes_converted_to_route_descriptors(self) -> None:
        result = validate_manifest(_minimal_manifest())

        assert len(result.routes) == 1
        assert result.routes[0].path == "/dashboard"
        assert result.routes[0].required_roles == ("admin",)
        assert result.routes[0].label == "Dashboard"

    def test_navigation_converted_to_navigation_entries(self) -> None:
        result = validate_manifest(_minimal_manifest())

        assert len(result.navigation) == 1
        nav = result.navigation[0]
        assert nav.label == "Dashboard"
        assert nav.icon == "dashboard"
        assert nav.path == "/dashboard"
        assert nav.required_roles == ("admin",)
        assert nav.group is None
        assert nav.order == 0

    def test_navigation_optional_group_and_order(self) -> None:
        data = _minimal_manifest(
            navigation=[
                {
                    "label": "Users",
                    "icon": "people",
                    "path": "/users",
                    "requiredRoles": ["super_admin"],
                    "group": "Management",
                    "order": 5,
                },
            ],
        )
        result = validate_manifest(data)

        assert result.navigation[0].group == "Management"
        assert result.navigation[0].order == 5

    def test_optional_fields_preserved(self) -> None:
        data = _minimal_manifest(
            stylesheetUrl="https://example.com/style.css",
            configSchema={"type": "object", "properties": {"key": {"type": "string"}}},
            healthEndpoint="/health",
            requiredPermissions=["read:users", "write:config"],
        )
        result = validate_manifest(data)

        assert result.stylesheet_url == "https://example.com/style.css"
        assert result.config_schema == {"type": "object", "properties": {"key": {"type": "string"}}}
        assert result.health_endpoint == "/health"
        assert result.required_permissions == ["read:users", "write:config"]

    def test_optional_fields_default_to_none(self) -> None:
        result = validate_manifest(_minimal_manifest())

        assert result.stylesheet_url is None
        assert result.config_schema is None
        assert result.health_endpoint is None
        assert result.required_permissions is None

    def test_multiple_routes_and_navigation(self) -> None:
        data = _minimal_manifest(
            routes=[
                {"path": "/a", "requiredRoles": ["admin"], "label": "A"},
                {"path": "/b", "requiredRoles": ["moderator", "admin"], "label": "B"},
            ],
            navigation=[
                {"label": "A", "icon": "a", "path": "/a", "requiredRoles": ["admin"]},
                {"label": "B", "icon": "b", "path": "/b", "requiredRoles": ["moderator"]},
            ],
        )
        result = validate_manifest(data)

        assert len(result.routes) == 2
        assert len(result.navigation) == 2
        assert result.routes[1].required_roles == ("moderator", "admin")


class TestValidateManifestMissingRequiredFields:
    """Tests for manifests missing required top-level fields."""

    def test_missing_name(self) -> None:
        data = _minimal_manifest()
        del data["name"]

        with pytest.raises(ValidationError, match="validation failed"):
            validate_manifest(data)

    def test_missing_version(self) -> None:
        data = _minimal_manifest()
        del data["version"]

        with pytest.raises(ValidationError, match="validation failed"):
            validate_manifest(data)

    def test_missing_entry_point(self) -> None:
        data = _minimal_manifest()
        del data["entryPoint"]

        with pytest.raises(ValidationError, match="validation failed"):
            validate_manifest(data)

    def test_missing_routes(self) -> None:
        data = _minimal_manifest()
        del data["routes"]

        with pytest.raises(ValidationError, match="validation failed"):
            validate_manifest(data)

    def test_missing_navigation(self) -> None:
        data = _minimal_manifest()
        del data["navigation"]

        with pytest.raises(ValidationError, match="validation failed"):
            validate_manifest(data)

    def test_empty_dict_reports_all_missing(self) -> None:
        with pytest.raises(ValidationError, match="validation failed"):
            validate_manifest({})


class TestValidateManifestInvalidValues:
    """Tests for manifests with wrong types or invalid formats."""

    def test_empty_name_rejected(self) -> None:
        with pytest.raises(ValidationError):
            validate_manifest(_minimal_manifest(name=""))

    def test_invalid_semver_rejected(self) -> None:
        with pytest.raises(ValidationError):
            validate_manifest(_minimal_manifest(version="1.0"))

    def test_non_semver_string_rejected(self) -> None:
        with pytest.raises(ValidationError):
            validate_manifest(_minimal_manifest(version="abc"))

    def test_route_missing_required_roles(self) -> None:
        data = _minimal_manifest(
            routes=[{"path": "/x", "label": "X"}],
        )
        with pytest.raises(ValidationError):
            validate_manifest(data)

    def test_navigation_missing_icon(self) -> None:
        data = _minimal_manifest(
            navigation=[{"label": "X", "path": "/x", "requiredRoles": ["admin"]}],
        )
        with pytest.raises(ValidationError):
            validate_manifest(data)

    def test_version_wrong_type(self) -> None:
        with pytest.raises(ValidationError):
            validate_manifest(_minimal_manifest(version=123))

    def test_routes_not_array(self) -> None:
        with pytest.raises(ValidationError):
            validate_manifest(_minimal_manifest(routes="not-an-array"))

    def test_descriptive_error_message(self) -> None:
        """Validation errors should be human-readable."""
        with pytest.raises(ValidationError) as exc_info:
            validate_manifest(_minimal_manifest(version="bad"))

        assert "version" in str(exc_info.value.message).lower() or "pattern" in str(exc_info.value.message).lower()
