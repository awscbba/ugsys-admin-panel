"""Service registration status value object."""

from enum import Enum


class ServiceStatus(str, Enum):
    """Status of a registered service in the Service Registry."""

    ACTIVE = "active"
    DEGRADED = "degraded"
    INACTIVE = "inactive"
