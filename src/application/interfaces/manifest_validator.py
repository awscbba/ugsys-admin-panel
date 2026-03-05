"""Plugin Manifest JSON Schema validator (Req 5.1, 5.2, 5.3, 5.4, 5.5).

Validates raw manifest dictionaries against the Plugin Manifest JSON Schema
and converts them into domain ``PluginManifest`` entities.
"""

from __future__ import annotations

from typing import Any

import jsonschema

from src.domain.entities import PluginManifest
from src.domain.exceptions import ValidationError
from src.domain.value_objects import NavigationEntry, RouteDescriptor

PLUGIN_MANIFEST_SCHEMA: dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["name", "version", "entryPoint", "routes", "navigation"],
    "properties": {
        "name": {"type": "string", "minLength": 1},
        "version": {"type": "string", "pattern": r"^\d+\.\d+\.\d+$"},
        "entryPoint": {"type": "string", "format": "uri"},
        "stylesheetUrl": {"type": "string", "format": "uri"},
        "configSchema": {"type": "object"},
        "healthEndpoint": {"type": "string"},
        "requiredPermissions": {"type": "array", "items": {"type": "string"}},
        "routes": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["path", "requiredRoles", "label"],
                "properties": {
                    "path": {"type": "string"},
                    "requiredRoles": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "label": {"type": "string"},
                },
            },
        },
        "navigation": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["label", "icon", "path", "requiredRoles"],
                "properties": {
                    "label": {"type": "string"},
                    "icon": {"type": "string"},
                    "path": {"type": "string"},
                    "requiredRoles": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "group": {"type": "string"},
                    "order": {"type": "integer"},
                },
            },
        },
    },
}


def validate_manifest(data: dict[str, Any]) -> PluginManifest:
    """Validate a raw manifest dict and return a ``PluginManifest`` entity.

    Parameters
    ----------
    data:
        Raw JSON-decoded manifest dictionary (camelCase keys).

    Returns
    -------
    PluginManifest
        A fully validated domain entity.

    Raises
    ------
    ValidationError
        If the manifest fails JSON Schema validation.  The error message
        contains a human-readable description of every violation.
    """
    errors = _collect_schema_errors(data)
    if errors:
        msg = "Plugin Manifest validation failed: " + "; ".join(errors)
        raise ValidationError(msg)

    return _build_manifest(data)


def _collect_schema_errors(data: dict[str, Any]) -> list[str]:
    """Return a list of human-readable validation error messages."""
    validator = jsonschema.Draft7Validator(PLUGIN_MANIFEST_SCHEMA)
    return sorted(_format_error(err) for err in validator.iter_errors(data))


def _format_error(error: jsonschema.ValidationError) -> str:
    """Produce a concise, descriptive message for a single schema error."""
    path = ".".join(str(p) for p in error.absolute_path) if error.absolute_path else "(root)"
    return f"{path}: {error.message}"


def _build_manifest(data: dict[str, Any]) -> PluginManifest:
    """Convert a validated raw dict into a ``PluginManifest`` domain entity."""
    routes = [
        RouteDescriptor(
            path=r["path"],
            required_roles=tuple(r["requiredRoles"]),
            label=r["label"],
        )
        for r in data["routes"]
    ]

    navigation = [
        NavigationEntry(
            label=n["label"],
            icon=n["icon"],
            path=n["path"],
            required_roles=tuple(n["requiredRoles"]),
            group=n.get("group"),
            order=n.get("order", 0),
        )
        for n in data["navigation"]
    ]

    return PluginManifest(
        name=data["name"],
        version=data["version"],
        entry_point=data["entryPoint"],
        routes=routes,
        navigation=navigation,
        stylesheet_url=data.get("stylesheetUrl"),
        config_schema=data.get("configSchema"),
        health_endpoint=data.get("healthEndpoint"),
        required_permissions=data.get("requiredPermissions"),
    )
