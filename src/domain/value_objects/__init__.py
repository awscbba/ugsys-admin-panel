"""Domain value objects."""

from .health_state import HealthState
from .navigation_entry import NavigationEntry
from .role import ADMIN_ROLES, NON_ADMIN_ROLES, AdminRole
from .route_descriptor import RouteDescriptor
from .service_status import ServiceStatus

__all__ = [
    "ADMIN_ROLES",
    "AdminRole",
    "HealthState",
    "NON_ADMIN_ROLES",
    "NavigationEntry",
    "RouteDescriptor",
    "ServiceStatus",
]
