"""Admin User entity representing an authenticated admin panel user."""

from __future__ import annotations

from dataclasses import dataclass

from src.domain.value_objects import AdminRole


@dataclass
class AdminUser:
    """A user with administrative roles authorized to access the Admin Panel.

    Constructed from the validated JWT claims and enriched with
    profile data from the User Profile Service.
    """

    user_id: str
    email: str
    roles: list[AdminRole]
    display_name: str
    avatar_url: str | None = None
