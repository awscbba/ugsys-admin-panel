"""Health Aggregator Service — periodic health polling of registered services.

Polls each registered service's health endpoint at a configurable interval
(default: 60 seconds) and stores results in an in-memory cache.

Behavior:
- Timeout per health check: 5 seconds → mark unhealthy (Req 8.4)
- Non-2xx response → mark degraded with status code (Req 8.5)
- Status transition healthy → unhealthy → emit admin.service.health_changed (Req 8.6)
- Results stored in in-memory dict (MVP; design mentions DynamoDB Health Cache)

Requirements: 8.1, 8.2, 8.4, 8.5, 8.6
"""

from __future__ import annotations

import asyncio
import datetime
import time
from typing import Any

import httpx
import structlog

from src.domain.entities.health_status import HealthStatus
from src.domain.repositories.event_publisher import EventPublisher
from src.domain.repositories.service_registry_repository import ServiceRegistryRepository
from src.domain.value_objects.health_state import HealthState

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

_HEALTH_CHECK_TIMEOUT = 5.0  # seconds (Req 8.4)
_DEFAULT_POLL_INTERVAL = 60  # seconds (Req 8.1)


class HealthAggregatorService:
    """Polls registered services' health endpoints and caches results.

    Parameters
    ----------
    registry_repo:
        Port for listing registered services.
    event_publisher:
        Port for emitting health change events.
    poll_interval:
        Seconds between polling cycles.  Defaults to 60.
    """

    def __init__(
        self,
        registry_repo: ServiceRegistryRepository,
        event_publisher: EventPublisher,
        poll_interval: int = _DEFAULT_POLL_INTERVAL,
    ) -> None:
        self._repo = registry_repo
        self._events = event_publisher
        self._poll_interval = poll_interval
        # In-memory health cache: service_name → HealthStatus
        self._cache: dict[str, HealthStatus] = {}
        self._polling_task: asyncio.Task[None] | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_all_statuses(self) -> list[HealthStatus]:
        """Return all cached health statuses."""
        return list(self._cache.values())

    def get_status(self, service_name: str) -> HealthStatus | None:
        """Return the cached health status for a specific service."""
        return self._cache.get(service_name)

    async def poll_once(self) -> None:
        """Run a single polling cycle across all registered services."""
        try:
            services = await self._repo.list_all()
        except Exception as exc:
            logger.error("health_poll_registry_error", error=str(exc))
            return

        if not services:
            return

        # Poll all services concurrently.
        await asyncio.gather(
            *[self._check_service(svc) for svc in services],
            return_exceptions=True,
        )

    async def start_polling(self) -> None:
        """Start the background polling loop."""
        if self._polling_task is not None and not self._polling_task.done():
            return
        self._polling_task = asyncio.create_task(self._polling_loop())
        logger.info("health_polling_started", interval=self._poll_interval)

    async def stop_polling(self) -> None:
        """Stop the background polling loop."""
        if self._polling_task is not None:
            self._polling_task.cancel()
            try:
                await self._polling_task
            except asyncio.CancelledError:
                pass
            self._polling_task = None
        logger.info("health_polling_stopped")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _polling_loop(self) -> None:
        """Continuously poll services at the configured interval."""
        while True:
            await self.poll_once()
            await asyncio.sleep(self._poll_interval)

    async def _check_service(self, service: Any) -> None:
        """Perform a single health check for one service."""
        service_name: str = service.service_name
        base_url: str = service.base_url.rstrip("/")
        health_path: str = service.health_endpoint or "/health"

        # Use manifest health endpoint if available.
        if service.manifest and service.manifest.health_endpoint:
            health_path = service.manifest.health_endpoint

        url = f"{base_url}{health_path}"
        previous = self._cache.get(service_name)

        start = time.monotonic()
        new_status = await self._do_health_request(url, service_name)
        elapsed_ms = int((time.monotonic() - start) * 1000)

        # Extract version from response if available.
        version = new_status.get("version", "unknown") if isinstance(new_status, dict) else "unknown"

        if isinstance(new_status, dict):
            # Successful 2xx response.
            status = HealthState.HEALTHY
            status_code = None
        elif isinstance(new_status, int):
            # Non-2xx response code.
            status = HealthState.DEGRADED
            status_code = new_status
            version = "unknown"
        else:
            # Timeout or connection error.
            status = HealthState.UNHEALTHY
            status_code = None
            version = "unknown"

        health_status = HealthStatus(
            service_name=service_name,
            status=status,
            last_check=datetime.datetime.now(datetime.UTC).isoformat(),
            response_time_ms=elapsed_ms,
            version=str(version),
            status_code=status_code,
        )

        # Detect healthy → unhealthy transition and emit event (Req 8.6).
        if previous is not None and previous.status == HealthState.HEALTHY and status == HealthState.UNHEALTHY:
            try:
                await self._events.publish(
                    "admin.service.health_changed",
                    {
                        "service_name": service_name,
                        "previous_status": previous.status.value,
                        "new_status": status.value,
                        "timestamp": health_status.last_check,
                    },
                )
                logger.info(
                    "health_state_transition_event_emitted",
                    service_name=service_name,
                    new_status=status.value,
                )
            except Exception as exc:
                logger.error(
                    "health_event_publish_failed",
                    service_name=service_name,
                    error=str(exc),
                )

        self._cache[service_name] = health_status
        logger.info(
            "health_check_completed",
            service_name=service_name,
            status=status.value,
            response_time_ms=elapsed_ms,
        )

    async def _do_health_request(
        self,
        url: str,
        service_name: str,
    ) -> dict[str, Any] | int | None:
        """Perform the HTTP health check request.

        Returns:
        - dict: parsed JSON body on 2xx success
        - int: HTTP status code on non-2xx response
        - None: on timeout or connection error
        """
        try:
            async with httpx.AsyncClient(timeout=_HEALTH_CHECK_TIMEOUT) as client:
                response = await client.get(url)
        except httpx.TimeoutException:
            logger.warning("health_check_timeout", service_name=service_name, url=url)
            return None  # → unhealthy (Req 8.4)
        except httpx.RequestError as exc:
            logger.warning("health_check_error", service_name=service_name, error=str(exc))
            return None  # → unhealthy

        if response.is_success:
            try:
                result: dict[str, Any] = dict(response.json())
                return result
            except Exception:
                return {}  # 2xx but non-JSON body → still healthy

        # Non-2xx → degraded (Req 8.5).
        return response.status_code
