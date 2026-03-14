"""Identity Manager HTTP client adapter.

Concrete implementation of the ``IdentityClient`` port that communicates
with the Identity Manager service over HTTP using ``httpx``.  Every
outbound call is wrapped in a ``CircuitBreaker`` to prevent cascade
failures when the Identity Manager is unavailable.

Endpoints targeted:
    POST  /api/v1/auth/login                  — authenticate
    POST  /api/v1/auth/refresh                — refresh_token
    POST  /api/v1/auth/logout                 — logout
    GET   /api/v1/users                       — list_users
    PATCH /api/v1/users/{user_id}/roles       — update_roles
    PATCH /api/v1/users/{user_id}/status      — update_status

Requirements: 2.1, 9.2, 9.4, 9.5
"""

from __future__ import annotations

import os
from typing import Any

import httpx

from src.domain.exceptions import (
    AuthenticationError,
    ExternalServiceError,
    GatewayTimeoutError,
)
from src.domain.repositories.circuit_breaker import CircuitBreaker
from src.domain.repositories.identity_client import IdentityClient

_DEFAULT_TIMEOUT = 10.0  # seconds — matches proxy timeout spec (Req 7.5)


class IdentityManagerClient(IdentityClient):
    """HTTP adapter for the Identity Manager service.

    Parameters
    ----------
    circuit_breaker:
        A ``CircuitBreaker`` instance that wraps every outbound call.
        Opens after 5 consecutive failures with a 30-second cooldown
        (Req 9.7).
    base_url:
        Base URL of the Identity Manager.  Defaults to the
        ``IDENTITY_MANAGER_BASE_URL`` environment variable.
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
        self._base_url = (base_url or os.environ.get("IDENTITY_MANAGER_BASE_URL", "")).rstrip("/")
        self._timeout = timeout

    # ------------------------------------------------------------------
    # IdentityClient port implementation
    # ------------------------------------------------------------------

    async def authenticate(self, email: str, password: str) -> dict[str, Any]:
        """Forward login credentials to ``POST /api/v1/auth/login``.

        Returns the token pair (access + refresh) on success.

        Raises
        ------
        AuthenticationError
            When the Identity Manager returns HTTP 401.
        ExternalServiceError
            When the circuit breaker is open or the request fails.
        GatewayTimeoutError
            When the request times out.
        """
        return await self._cb.call(
            self._post,
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )

    async def refresh_token(self, refresh_token: str) -> dict[str, Any]:
        """Exchange a refresh token via ``POST /api/v1/auth/refresh``.

        Raises
        ------
        AuthenticationError
            When the Identity Manager returns HTTP 401 (token expired/invalid).
        ExternalServiceError
            When the circuit breaker is open or the request fails.
        GatewayTimeoutError
            When the request times out.
        """
        return await self._cb.call(
            self._post,
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )

    async def logout(self, token: str) -> None:
        """Invalidate the session via ``POST /api/v1/auth/logout``.

        Raises
        ------
        ExternalServiceError
            When the circuit breaker is open or the request fails.
        GatewayTimeoutError
            When the request times out.
        """
        await self._cb.call(
            self._post,
            "/api/v1/auth/logout",
            json={"token": token},
        )

    async def list_users(
        self,
        *,
        token: str,
        search: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        """Fetch a paginated user list via ``GET /api/v1/users``.

        Raises
        ------
        ExternalServiceError
            When the circuit breaker is open or the request fails.
        GatewayTimeoutError
            When the request times out.
        """
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if search is not None:
            params["search"] = search

        return await self._cb.call(
            self._get,
            "/api/v1/users",
            params=params,
            token=token,
        )

    async def update_roles(self, user_id: str, roles: list[str], *, token: str) -> None:
        """Change a user's roles via ``PATCH /api/v1/users/{user_id}/roles``.

        Raises
        ------
        ExternalServiceError
            When the circuit breaker is open or the request fails.
        GatewayTimeoutError
            When the request times out.
        """
        await self._cb.call(
            self._patch,
            f"/api/v1/users/{user_id}/roles",
            json={"roles": roles},
            token=token,
        )

    async def update_status(self, user_id: str, status: str, *, token: str) -> None:
        """Activate or deactivate a user via ``PATCH /api/v1/users/{user_id}/status``.

        Raises
        ------
        ExternalServiceError
            When the circuit breaker is open or the request fails.
        GatewayTimeoutError
            When the request times out.
        """
        await self._cb.call(
            self._patch,
            f"/api/v1/users/{user_id}/status",
            json={"status": status},
            token=token,
        )

    # ------------------------------------------------------------------
    # Private HTTP helpers
    # ------------------------------------------------------------------

    async def _get(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        token: str = "",
    ) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                response = await client.get(url, params=params, headers=headers)
            except httpx.TimeoutException as exc:
                raise GatewayTimeoutError(
                    f"Identity Manager did not respond in time (GET {path}).",
                ) from exc
            except httpx.RequestError as exc:
                raise ExternalServiceError(
                    f"Identity Manager request failed (GET {path}): {exc}",
                ) from exc
        return self._handle_response(response, path)

    async def _post(
        self,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        token: str = "",
    ) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                response = await client.post(url, json=json, headers=headers)
            except httpx.TimeoutException as exc:
                raise GatewayTimeoutError(
                    f"Identity Manager did not respond in time (POST {path}).",
                ) from exc
            except httpx.RequestError as exc:
                raise ExternalServiceError(
                    f"Identity Manager request failed (POST {path}): {exc}",
                ) from exc
        return self._handle_response(response, path)

    async def _patch(
        self,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        token: str = "",
    ) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                response = await client.patch(url, json=json, headers=headers)
            except httpx.TimeoutException as exc:
                raise GatewayTimeoutError(
                    f"Identity Manager did not respond in time (PATCH {path}).",
                ) from exc
            except httpx.RequestError as exc:
                raise ExternalServiceError(
                    f"Identity Manager request failed (PATCH {path}): {exc}",
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
        AuthenticationError
            On HTTP 401.
        ExternalServiceError
            On HTTP 4xx (other than 401) or 5xx.
        """
        if response.is_success:
            # Some endpoints (e.g. logout, update_roles, update_status) may
            # return 204 No Content — return an empty dict in that case.
            if response.status_code == 204 or not response.content:
                return {}
            body = response.json()
            # Identity Manager wraps all responses in {"data": ..., "meta": ...}.
            # Unwrap the envelope so callers receive the payload directly.
            if isinstance(body, dict) and "data" in body:
                data = body["data"]
                return dict(data) if isinstance(data, dict) else {"items": data, "meta": body.get("meta", {})}
            return dict(body)

        if response.status_code == 401:
            raise AuthenticationError(
                "Authentication failed or token is invalid.",
            )

        # All other non-2xx responses are treated as external service errors.
        raise ExternalServiceError(
            f"Identity Manager returned HTTP {response.status_code} for {path}.",
        )
