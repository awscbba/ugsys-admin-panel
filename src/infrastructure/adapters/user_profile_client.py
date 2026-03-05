"""User Profile Service HTTP client adapter.

Concrete implementation of the ``ProfileClient`` port that communicates
with the User Profile Service over HTTP using ``httpx``.  Every outbound
call is wrapped in a ``CircuitBreaker`` to prevent cascade failures when
the service is unavailable.

Endpoint targeted:
    GET /api/v1/profiles/{user_id}   — get_profile / get_profiles

Requirements: 1.3, 9.2
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx

from src.domain.exceptions import (
    ExternalServiceError,
    GatewayTimeoutError,
    NotFoundError,
)
from src.domain.repositories.circuit_breaker import CircuitBreaker
from src.domain.repositories.profile_client import ProfileClient

_DEFAULT_TIMEOUT = 10.0  # seconds — matches proxy timeout spec (Req 7.5)


class UserProfileClient(ProfileClient):
    """HTTP adapter for the User Profile Service.

    Parameters
    ----------
    circuit_breaker:
        A ``CircuitBreaker`` instance that wraps every outbound call.
        Opens after 5 consecutive failures with a 30-second cooldown
        (Req 9.7).
    base_url:
        Base URL of the User Profile Service.  Defaults to the
        ``USER_PROFILE_SERVICE_BASE_URL`` environment variable.
    timeout:
        Per-request timeout in seconds.  Defaults to 10 s.
    """

    def __init__(
        self,
        circuit_breaker: CircuitBreaker,
        *,
        base_url: str | None = None,
        timeout: float = _DEFAULT_TIMEOUT,
    ) -> None:
        self._cb = circuit_breaker
        self._base_url = (
            base_url
            or os.environ.get("USER_PROFILE_SERVICE_BASE_URL", "")
        ).rstrip("/")
        self._timeout = timeout

    # ------------------------------------------------------------------
    # ProfileClient port implementation
    # ------------------------------------------------------------------

    async def get_profile(self, user_id: str) -> dict[str, Any]:
        """Fetch a single user profile via ``GET /api/v1/profiles/{user_id}``.

        Returns the profile data dict on success.

        Raises
        ------
        NotFoundError
            When the User Profile Service returns HTTP 404.
        ExternalServiceError
            When the circuit breaker is open or the request fails.
        GatewayTimeoutError
            When the request times out.
        """
        return await self._cb.call(self._get_profile, user_id)

    async def get_profiles(
        self,
        user_ids: list[str],
    ) -> dict[str, dict[str, Any]]:
        """Fetch multiple user profiles concurrently.

        Issues one ``GET /api/v1/profiles/{user_id}`` request per ID in
        parallel using ``asyncio.gather``.  Profiles that cannot be
        fetched (404 or service error) are omitted from the result rather
        than failing the entire batch.

        Returns a mapping of ``user_id → profile_data``.

        Raises
        ------
        ExternalServiceError
            When the circuit breaker is open (raised before any requests
            are dispatched).
        """
        if not user_ids:
            return {}

        results = await asyncio.gather(
            *[self.get_profile(uid) for uid in user_ids],
            return_exceptions=True,
        )

        profiles: dict[str, dict[str, Any]] = {}
        for uid, result in zip(user_ids, results, strict=True):
            if isinstance(result, BaseException):
                # Silently skip profiles that could not be fetched so that
                # a single missing profile does not degrade the entire list.
                continue
            profiles[uid] = result

        return profiles

    # ------------------------------------------------------------------
    # Private HTTP helper
    # ------------------------------------------------------------------

    async def _get_profile(self, user_id: str) -> dict[str, Any]:
        path = f"/api/v1/profiles/{user_id}"
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                response = await client.get(url)
            except httpx.TimeoutException as exc:
                raise GatewayTimeoutError(
                    f"User Profile Service did not respond in time (GET {path}).",
                ) from exc
            except httpx.RequestError as exc:
                raise ExternalServiceError(
                    f"User Profile Service request failed (GET {path}): {exc}",
                ) from exc
        return self._handle_response(response, path)

    # ------------------------------------------------------------------
    # Response handling
    # ------------------------------------------------------------------

    @staticmethod
    def _handle_response(response: httpx.Response, path: str) -> dict[str, Any]:
        """Translate HTTP status codes into domain exceptions.

        Returns the parsed JSON body on success (2xx).

        Raises
        ------
        NotFoundError
            On HTTP 404.
        ExternalServiceError
            On HTTP 4xx (other than 404) or 5xx.
        """
        if response.is_success:
            if response.status_code == 204 or not response.content:
                return {}
            return response.json()

        if response.status_code == 404:
            raise NotFoundError(
                f"User profile not found: {path}.",
            )

        raise ExternalServiceError(
            f"User Profile Service returned HTTP {response.status_code} for {path}.",
        )
