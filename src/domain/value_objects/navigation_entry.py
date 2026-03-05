"""Navigation entry value object from Plugin Manifest (Req 5.4)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class NavigationEntry:
    """A sidebar navigation item contributed by a Plugin Manifest.

    Entries are grouped by service, filtered by user roles,
    and sorted by the ``order`` field.
    """

    label: str
    icon: str
    path: str
    required_roles: tuple[str, ...]
    group: str | None = None
    order: int = 0
