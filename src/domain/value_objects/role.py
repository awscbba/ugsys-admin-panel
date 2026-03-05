"""Admin role value objects for RBAC enforcement."""

from enum import Enum


class AdminRole(str, Enum):
    """Roles that grant access to the Admin Panel.

    Hierarchy: super_admin > admin > moderator > auditor
    """

    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MODERATOR = "moderator"
    AUDITOR = "auditor"


ADMIN_ROLES: set[AdminRole] = {
    AdminRole.SUPER_ADMIN,
    AdminRole.ADMIN,
    AdminRole.MODERATOR,
    AdminRole.AUDITOR,
}
"""Roles permitted to access the Admin Panel (Req 3.7)."""

NON_ADMIN_ROLES: set[str] = {"member", "guest", "system"}
"""Roles that are explicitly denied Admin Panel access (Req 3.7)."""
