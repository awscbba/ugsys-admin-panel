"""Plugin Manifest entity describing a micro-frontend contribution (Req 5.1)."""

from __future__ import annotations

from dataclasses import dataclass, field

from src.domain.value_objects import NavigationEntry, RouteDescriptor


@dataclass
class PluginManifest:
    """Metadata document exposed by a registered microservice.

    Describes the micro-frontend assets, routes, navigation entries,
    and optional configuration contributed to the Admin Panel.
    """

    name: str
    version: str  # semver (e.g. "1.2.3")
    entry_point: str  # URL to JS bundle
    routes: list[RouteDescriptor]
    navigation: list[NavigationEntry]
    stylesheet_url: str | None = None
    config_schema: dict | None = None  # type: ignore[type-arg]
    health_endpoint: str | None = None
    required_permissions: list[str] | None = field(default=None)
