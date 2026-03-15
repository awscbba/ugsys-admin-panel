"""User Profile Service HTTP adapter — read/write operations.

Concrete implementation of ``UserProfileServiceClient`` that communicates
with the User Profile Service over HTTP using ``httpx``. Every outbound
call is wrapped in a ``CircuitBreaker``.

Endpoints targeted:
    GET   /api/v1/profiles/{user_id}                  — get_profile
    PATCH /api/v1/profiles/{user_id}/personal         — update_personal
    PATCH /api/v1/profiles/{user_id}/contact          — update_contact
    PATCH /api/v1/profiles/{user_id}/display          — update_display
    PATCH /api/v1/profiles/{user_id}/preferences      — update_preferences

Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 15.5
"""

from __future__ import annotations

import time
from typing import Any

import httpx
import structlog

from src.domain.exceptions import ExternalServiceError, GatewayTimeoutError, NotFoundError
from src.domain.repositories.circuit_breaker import CircuitBreaker
from src.domain.repositories.user_profile_service_client import UserProfileServiceClient

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

_DEFAULT_TIMEOUT = 10.0


class UserProfileServiceAdapter(UserProfileServiceClient):
    """HTTP adapter for UPS profile read/write operations.

    Parameters
    ----------
    circuit_breaker:
        Wraps every outbound call; opens after 5 consecutive failures.
    base_url:
        Base URL of the User Profile Service.
    timeout:
        Per-request timeout in seconds. Defaults to 10 s.
    """

    def __init__(
        self,
        circuit_breaker: CircuitBreaker,
        *,
        base_url: str,
        timeout: float = _DEFAULT_TIMEOUT,
    ) -> None:
        self._cb = circuit_breaker
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

    # ------------------------------------------------------------------
    # UserProfileServiceClient port implementation
    # ------------------------------------------------------------------

    async def get_profile(
        self,
        user_id: str,
        *,
        token: str,
        correlation_id: str | None = None,
    ) -> dict[str, Any]:
        return await self._cb.call(
            self._get_profile, user_id, token=token, correlation_id=correlation_id
        )

    async def update_personal(
        self,
        user_id: str,
        fields: dict[str, Any],
        *,
        token: str,
        correlation_id: str | None = None,
    ) -> None:
        await self._cb.call(
            self._patch,
            user_id,
            "personal",
            fields,
            token=token,
            correlation_id=correlation_id,
        )

    async def update_contact(
        self,
        user_id: str,
        fields: dict[str, Any],
        *,
        token: str,
        correlation_id: str | None = None,
    ) -> None:
        await self._cb.call(
            self._patch,
            user_id,
            "contact",
            fields,
            token=token,
            correlation_id=correlation_id,
        )

    async def update_display(
        self,
        user_id: str,
        fields: dict[str, Any],
        *,
        token: str,
        correlation_id: str | None = None,
    ) -> None:
        await self._cb.call(
            self._patch,
            user_id,
            "display",
            fields,
            token=token,
            correlation_id=correlation_id,
        )

    async def update_preferences(
        self,
        user_id: str,
        fields: dict[str, Any],
        *,
        token: str,
        correlation_id: str | None = None,
    ) -> None:
        await self._cb.call(
            self._patch,
            user_id,
            "preferences",
            fields,
            token=token,
            correlation_id=correlation_id,
        )

    # ------------------------------------------------------------------
    # Private HTTP helpers
    # ------------------------------------------------------------------

    def _build_headers(self, token: str, correlation_id: str | None) -> dict[str, str]:
        headers: dict[str, str] = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if correlation_id:
            headers["X-Request-ID"] = correlation_id
        return headers

    async def _get_profile(
        self,
        user_id: str,
        *,
        token: str = "",
        correlation_id: str | None = None,
    ) -> dict[str, Any]:
        path = f"/api/v1/profiles/{user_id}"
        url = f"{self._base_url}{path}"
        headers = self._build_headers(token, correlation_id)
        start = time.perf_counter()
        logger.info("ups_profile.fetch.started", user_id=user_id, operation="get_profile")
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                response = await client.get(url, headers=headers)
            except httpx.TimeoutException as exc:
                logger.error(
                    "ups_profile.fetch.failed",
                    user_id=user_id,
                    operation="get_profile",
                    duration_ms=round((time.perf_counter() - start) * 1000, 2),
                )
                raise GatewayTimeoutError(
                    f"UPS did not respond in time (GET {path})."
                ) from exc
            except httpx.RequestError as exc:
                logger.error(
                    "ups_profile.fetch.failed",
                    user_id=user_id,
                    operation="get_profile",
                    duration_ms=round((time.perf_counter() - start) * 1000, 2),
                )
                raise ExternalServiceError(
                    f"UPS request failed (GET {path}): {exc}"
                ) from exc
        result = self._handle_response(response, path)
        logger.info(
            "ups_profile.fetch.completed",
            user_id=user_id,
            operation="get_profile",
            duration_ms=round((time.perf_counter() - start) * 1000, 2),
        )
        return result

    async def _patch(
        self,
        user_id: str,
        section: str,
        fields: dict[str, Any],
        *,
        token: str = "",
        correlation_id: str | None = None,
    ) -> None:
        path = f"/api/v1/profiles/{user_id}/{section}"
        url = f"{self._base_url}{path}"
        headers = self._build_headers(token, correlation_id)
        start = time.perf_counter()
        # Log user_id, section, duration_ms — never field values (Req 15.5)
        logger.info(
            "ups_profile.update.started",
            user_id=user_id,
            section=section,
        )
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                response = await client.patch(url, json=fields, headers=headers)
            except httpx.TimeoutException as exc:
                logger.error(
                    "ups_profile.update.failed",
                    user_id=user_id,
                    section=section,
                    duration_ms=round((time.perf_counter() - start) * 1000, 2),
                )
                raise GatewayTimeoutError(
                    f"UPS did not respond in time (PATCH {path})."
                ) from exc
            except httpx.RequestError as exc:
                logger.error(
                    "ups_profile.update.failed",
                    user_id=user_id,
                    section=section,
                    duration_ms=round((time.perf_counter() - start) * 1000, 2),
                )
                raise ExternalServiceError(
                    f"UPS request failed (PATCH {path}): {exc}"
                ) from exc
        self._handle_response(response, path)
        logger.info(
            "ups_profile.update.completed",
            user_id=user_id,
            section=section,
            duration_ms=round((time.perf_counter() - start) * 1000, 2),
        )

    # ------------------------------------------------------------------
    # Response handling
    # ------------------------------------------------------------------

    @staticmethod
    def _handle_response(response: httpx.Response, path: str) -> dict[str, Any]:
        if response.is_success:
            if response.status_code == 204 or not response.content:
                return {}
            return dict(response.json())

        if response.status_code == 404:
            raise NotFoundError(f"UPS profile not found: {path}.")

        raise ExternalServiceError(
            f"UPS returned HTTP {response.status_code} for {path}."
        )
