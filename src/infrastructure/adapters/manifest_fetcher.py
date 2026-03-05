"""Plugin Manifest fetcher adapter.

Fetches a Plugin Manifest JSON document from a declared URL and returns
the parsed dict.  All network and protocol errors are translated into
domain exceptions so callers never need to handle ``httpx`` internals.

Requirements: 4.5, 4.6
"""

from __future__ import annotations

from typing import Any

import httpx

from src.domain.exceptions import (
    ExternalServiceError,
    GatewayTimeoutError,
    ValidationError,
)

_DEFAULT_TIMEOUT = 10.0  # seconds


async def fetch_manifest(url: str, *, timeout: float = _DEFAULT_TIMEOUT) -> dict[str, Any]:
    """Fetch and parse a Plugin Manifest from *url*.

    Parameters
    ----------
    url:
        Fully-qualified URL pointing to the manifest JSON document.
    timeout:
        Per-request timeout in seconds.  Defaults to 10 s.

    Returns
    -------
    dict
        Parsed JSON body of the manifest.

    Raises
    ------
    GatewayTimeoutError
        When the remote host does not respond within *timeout* seconds.
    ExternalServiceError
        When the connection fails or the server returns a non-2xx status.
    ValidationError
        When the response body is not valid JSON.
    """
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.get(url)
        except httpx.TimeoutException as exc:
            raise GatewayTimeoutError(
                f"Manifest URL did not respond in time: {url}",
            ) from exc
        except httpx.RequestError as exc:
            raise ExternalServiceError(
                f"Could not reach manifest URL: {url} — {exc}",
            ) from exc

    if not response.is_success:
        raise ExternalServiceError(
            f"Manifest URL returned HTTP {response.status_code}: {url}",
        )

    try:
        return dict(response.json())
    except Exception as exc:
        raise ValidationError(
            f"Manifest response is not valid JSON: {url}",
        ) from exc
