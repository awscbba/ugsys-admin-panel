"""Config Service — JSON Schema-driven configuration management.

Validates submitted configuration against the stored configSchema before
forwarding to the target service. Logs changes with diff.

Requirements: 10.1, 10.3, 10.4, 10.5, 10.6, 10.7
"""

from __future__ import annotations

from typing import Any

import httpx
import jsonschema
import structlog

from src.domain.exceptions import (
    AuthorizationError,
    ExternalServiceError,
    GatewayTimeoutError,
    NotFoundError,
    ValidationError,
)
from src.domain.repositories.event_publisher import EventPublisher
from src.domain.repositories.service_registry_repository import ServiceRegistryRepository
from src.domain.value_objects.role import AdminRole
from src.infrastructure.logging import sanitize_string

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

_CONFIG_TIMEOUT = 10.0  # seconds

# Sensitive field patterns to exclude from diff logging (Req 10.6).
_SENSITIVE_PATTERNS = frozenset(
    {
        "password",
        "secret",
        "token",
        "key",
        "auth",
        "credential",
        "private",
        "cert",
        "api_key",
    }
)


def _is_sensitive_field(field_name: str) -> bool:
    """Return True if the field name matches a sensitive pattern."""
    lower = field_name.lower()
    return any(pattern in lower for pattern in _SENSITIVE_PATTERNS)


def _compute_diff(old: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
    """Compute a diff of changed fields, excluding sensitive values."""
    diff: dict[str, Any] = {}
    all_keys = set(old) | set(new)
    for key in all_keys:
        old_val = old.get(key)
        new_val = new.get(key)
        if old_val != new_val:
            if _is_sensitive_field(key):
                diff[key] = {"old": "[REDACTED]", "new": "[REDACTED]"}
            else:
                diff[key] = {"old": old_val, "new": new_val}
    return diff


class ConfigService:
    """Application service for configuration management.

    Parameters
    ----------
    registry_repo:
        Port for retrieving service registrations and config schemas.
    event_publisher:
        Port for emitting config update events.
    """

    def __init__(
        self,
        registry_repo: ServiceRegistryRepository,
        event_publisher: EventPublisher,
    ) -> None:
        self._repo = registry_repo
        self._events = event_publisher

    async def get_config_schema(self, service_name: str) -> dict[str, Any] | None:
        """Return the stored JSON Schema for a service's configuration.

        Requirements: 10.1

        Raises
        ------
        NotFoundError
            When the service does not exist.
        """
        registration = await self._repo.get_by_name(service_name)
        if registration is None:
            raise NotFoundError(f"Service '{service_name}' not found in registry.")

        if registration.manifest is None:
            return None

        return registration.manifest.config_schema

    async def submit_config(
        self,
        service_name: str,
        payload: dict[str, Any],
        user_id: str,
        user_roles: list[str],
    ) -> dict[str, Any]:
        """Validate and forward a configuration change to the target service.

        Requirements: 10.3, 10.4, 10.5, 10.6, 10.7

        Parameters
        ----------
        service_name:
            Target service name.
        payload:
            Configuration payload to submit.
        user_id:
            ID of the admin user submitting the change.
        user_roles:
            Roles of the requesting user.

        Returns
        -------
        dict
            Response from the target service.

        Raises
        ------
        AuthorizationError
            When the user is not super_admin or admin (Req 10.7).
        NotFoundError
            When the service does not exist.
        ValidationError
            When the payload fails schema validation (Req 10.5).
        GatewayTimeoutError
            When the target service times out.
        ExternalServiceError
            When the target service is unreachable.
        """
        # Enforce super_admin or admin only (Req 10.7).
        allowed_roles = {AdminRole.SUPER_ADMIN.value, AdminRole.ADMIN.value}
        if not set(user_roles).intersection(allowed_roles):
            raise AuthorizationError(
                "Configuration management requires super_admin or admin role.",
                error_code="FORBIDDEN",
            )

        registration = await self._repo.get_by_name(service_name)
        if registration is None:
            raise NotFoundError(f"Service '{service_name}' not found in registry.")

        # Validate against configSchema if present (Req 10.4, 10.5).
        config_schema = registration.manifest.config_schema if registration.manifest else None
        if config_schema:
            self._validate_against_schema(payload, config_schema)

        # Forward to target service's config endpoint (Req 10.3).
        config_endpoint = self._resolve_config_endpoint(registration)
        result = await self._forward_config(config_endpoint, payload)

        # Log change with diff (Req 10.6).
        diff = _compute_diff({}, payload)  # No previous config stored at BFF level.
        logger.info(
            "config_change_applied",
            service_name=sanitize_string(service_name),
            user_id=sanitize_string(user_id),
            diff=diff,
        )

        # Emit event (Req 12.4).
        try:
            await self._events.publish(
                "admin.config.updated",
                {
                    "service_name": service_name,
                    "user_id": user_id,
                    "diff_keys": list(diff.keys()),
                },
            )
        except Exception as exc:
            logger.warning("config_event_publish_failed", error=str(exc))

        return result

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_against_schema(
        payload: dict[str, Any],
        schema: dict[str, Any],
    ) -> None:
        """Validate payload against JSON Schema.

        Raises
        ------
        ValidationError
            With descriptive error messages on failure (Req 10.5).
        """
        validator = jsonschema.Draft7Validator(schema)
        errors = sorted(
            f"{'.'.join(str(p) for p in e.absolute_path) or '(root)'}: {e.message}"
            for e in validator.iter_errors(payload)
        )
        if errors:
            raise ValidationError(
                "Configuration validation failed: " + "; ".join(errors),
            )

    @staticmethod
    def _resolve_config_endpoint(registration: Any) -> str:
        """Determine the config endpoint URL for the service."""
        base_url = registration.base_url.rstrip("/")
        # Use manifest-declared config endpoint if available, else default.
        return f"{base_url}/config"

    @staticmethod
    async def _forward_config(
        endpoint: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """POST the config payload to the target service endpoint."""
        try:
            async with httpx.AsyncClient(timeout=_CONFIG_TIMEOUT) as client:
                response = await client.post(endpoint, json=payload)
        except httpx.TimeoutException as exc:
            raise GatewayTimeoutError(
                "Target service did not respond in time for config update.",
            ) from exc
        except httpx.RequestError as exc:
            raise ExternalServiceError(
                f"Could not reach target service for config update: {exc}",
            ) from exc

        if not response.is_success:
            raise ExternalServiceError(
                f"Target service returned HTTP {response.status_code} for config update.",
            )

        try:
            return response.json()  # type: ignore[no-any-return]
        except Exception:
            return {"status": "ok"}
