"""Proxy Service — forward requests from Admin Shell to downstream services.

Responsibilities:
- Resolve target service URL from the Service Registry
- Attach Admin User's JWT as Authorization: Bearer header
- Propagate X-Request-ID correlation header
- Enforce RBAC against route's requiredRoles from Plugin Manifest
- Timeout: 10 seconds → HTTP 504 GATEWAY_TIMEOUT
- Strip internal headers from downstream responses
- Forward downstream error status codes with safe error body

Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from src.domain.exceptions import (
    AuthorizationError,
    GatewayTimeoutError,
    NotFoundError,
)
from src.domain.repositories.service_registry_repository import ServiceRegistryRepository

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

# Headers to strip from downstream responses (Req 7.7, 13.5).
_STRIP_RESPONSE_HEADERS = frozenset(
    {
        "x-forwarded-for",
        "x-real-ip",
        "server",
    }
)

_PROXY_TIMEOUT = 10.0  # seconds (Req 7.5)


class ProxyService:
    """Application service for proxying requests to downstream services.

    Parameters
    ----------
    registry_repo:
        Port for resolving service base URLs and manifests.
    """

    def __init__(self, registry_repo: ServiceRegistryRepository) -> None:
        self._repo = registry_repo

    async def forward(
        self,
        service_name: str,
        path: str,
        method: str,
        headers: dict[str, str],
        body: bytes,
        query_params: dict[str, str],
        user_jwt: str,
        user_roles: list[str],
        correlation_id: str,
    ) -> tuple[int, dict[str, str], bytes]:
        """Forward a request to the target downstream service.

        Parameters
        ----------
        service_name:
            Name of the target service in the registry.
        path:
            Request path to forward (relative to service base URL).
        method:
            HTTP method (GET, POST, PUT, PATCH, DELETE, etc.).
        headers:
            Incoming request headers (will be filtered before forwarding).
        body:
            Raw request body bytes.
        query_params:
            Query string parameters.
        user_jwt:
            Admin User's JWT to attach as Authorization: Bearer.
        user_roles:
            Admin User's roles for RBAC enforcement.
        correlation_id:
            X-Request-ID to propagate.

        Returns
        -------
        tuple[int, dict[str, str], bytes]
            ``(status_code, response_headers, response_body)``

        Raises
        ------
        NotFoundError
            When the service is not found in the registry (Req 7.4).
        AuthorizationError
            When the user lacks required roles for the route (Req 3.2, 3.3).
        GatewayTimeoutError
            When the downstream service times out (Req 7.5).
        """
        # Resolve service from registry (Req 7.1, 7.4).
        registration = await self._repo.get_by_name(service_name)
        if registration is None:
            raise NotFoundError(
                f"Service '{service_name}' not found in registry.",
                error_code="SERVICE_NOT_FOUND",
            )

        # RBAC enforcement against Plugin Manifest routes (Req 3.2, 3.3).
        if registration.manifest is not None:
            self._enforce_rbac(path, user_roles, registration.manifest.routes)

        # Build target URL (Req 7.1).
        base_url = registration.base_url.rstrip("/")
        target_url = f"{base_url}/{path.lstrip('/')}"

        # Build outbound headers.
        outbound_headers = self._build_outbound_headers(
            headers=headers,
            user_jwt=user_jwt,
            correlation_id=correlation_id,
        )

        # Forward the request (Req 7.2, 7.3).
        try:
            async with httpx.AsyncClient(timeout=_PROXY_TIMEOUT) as client:
                response = await client.request(
                    method=method,
                    url=target_url,
                    headers=outbound_headers,
                    content=body if body else None,
                    params=query_params,
                )
        except httpx.TimeoutException as exc:
            logger.warning(
                "proxy_timeout",
                service_name=service_name,
                path=path,
                correlation_id=correlation_id,
            )
            raise GatewayTimeoutError(
                f"Service '{service_name}' did not respond within {_PROXY_TIMEOUT}s.",
                error_code="GATEWAY_TIMEOUT",
            ) from exc
        except httpx.RequestError as exc:
            logger.warning(
                "proxy_request_error",
                service_name=service_name,
                path=path,
                error=str(exc),
            )
            from src.domain.exceptions import ExternalServiceError

            raise ExternalServiceError(
                f"Could not reach service '{service_name}'.",
            ) from exc

        # Strip internal headers from downstream response (Req 7.7, 13.5).
        response_headers = self._strip_internal_headers(dict(response.headers))

        # For error responses, return safe body (Req 7.8).
        if response.is_error:
            safe_body = self._safe_error_body(response)
            return response.status_code, response_headers, safe_body

        return response.status_code, response_headers, response.content

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _enforce_rbac(
        self,
        path: str,
        user_roles: list[str],
        routes: list[Any],
    ) -> None:
        """Check user roles against the matching route's requiredRoles.

        Only enforces when a matching route descriptor is found.
        If no route matches, the request is allowed through (open route).
        """
        for route in routes:
            # Simple prefix match on the route path.
            route_path: str = route.path if hasattr(route, "path") else route.get("path", "")
            if path.startswith(route_path.rstrip("/")):
                required_roles: list[str] = (
                    list(route.required_roles) if hasattr(route, "required_roles") else route.get("requiredRoles", [])
                )
                if required_roles and not set(user_roles).intersection(required_roles):
                    raise AuthorizationError(
                        "You do not have the required role for this route.",
                        error_code="FORBIDDEN",
                    )
                return  # First matching route wins.

    @staticmethod
    def _build_outbound_headers(
        headers: dict[str, str],
        user_jwt: str,
        correlation_id: str,
    ) -> dict[str, str]:
        """Build the outbound header dict for the downstream request."""
        # Start with a filtered copy of incoming headers.
        # Drop hop-by-hop and sensitive headers.
        _skip = frozenset(
            {
                "host",
                "connection",
                "transfer-encoding",
                "te",
                "trailer",
                "upgrade",
                "proxy-authorization",
                "cookie",  # Don't forward BFF cookies to downstream.
            }
        )
        outbound = {k: v for k, v in headers.items() if k.lower() not in _skip}
        # Attach Admin User's JWT (Req 7.2).
        outbound["Authorization"] = f"Bearer {user_jwt}"
        # Propagate correlation ID (Req 7.3).
        outbound["X-Request-ID"] = correlation_id
        return outbound

    @staticmethod
    def _strip_internal_headers(headers: dict[str, str]) -> dict[str, str]:
        """Remove internal headers from the downstream response (Req 7.7, 13.5)."""
        return {k: v for k, v in headers.items() if k.lower() not in _STRIP_RESPONSE_HEADERS}

    @staticmethod
    def _safe_error_body(response: httpx.Response) -> bytes:
        """Return a safe error body without internal service details (Req 7.8)."""
        import json

        try:
            # Try to parse the downstream error and extract only safe fields.
            data = response.json()
            safe = {
                "error": data.get("error", "DOWNSTREAM_ERROR"),
                "message": data.get("message", "An error occurred in the downstream service."),
                "data": {},
            }
        except Exception:
            safe = {
                "error": "DOWNSTREAM_ERROR",
                "message": "An error occurred in the downstream service.",
                "data": {},
            }
        return json.dumps(safe).encode()
