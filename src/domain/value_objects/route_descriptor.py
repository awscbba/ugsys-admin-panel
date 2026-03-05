"""Route descriptor value object from Plugin Manifest (Req 5.3)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RouteDescriptor:
    """A route contributed by a Plugin Manifest.

    Each route declares a path, the roles required to access it,
    and a human-readable label.
    """

    path: str
    required_roles: tuple[str, ...]
    label: str
