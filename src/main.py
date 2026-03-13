"""FastAPI application entry point — wires all routers, middleware, and DI.

Middleware stack (applied in reverse registration order, so first registered
runs outermost):
    1. Correlation ID       — extract/generate X-Request-ID
    2. Security Headers     — add security response headers, remove Server
    3. CSRF                 — Double Submit Cookie validation
    4. Rate Limiting        — per-user and per-IP limits
    5. JWT Validation       — validate RS256 token, attach user to state
    6. Audit Logging        — log state-changing requests
    7. Body Size Limit      — reject bodies > 1 MB (raw ASGI middleware)
    8. CORS                 — origin allowlist enforcement

Routers registered under /api/v1/:
    - /api/v1/auth/...
    - /api/v1/registry/...
    - /api/v1/proxy/...          (proxy + config)
    - /api/v1/health/...
    - /api/v1/users/...
    - /api/v1/audit/...
    - /health                    (BFF own health check — no prefix)

Requirements: All (integration)
"""

from __future__ import annotations

import contextlib
import os
from collections.abc import AsyncGenerator

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from src.application.services.audit_service import AuditService
from src.application.services.auth_service import AuthService
from src.application.services.config_service import ConfigService
from src.application.services.event_processing_service import EventProcessingService
from src.application.services.health_aggregator_service import HealthAggregatorService
from src.application.services.proxy_service import ProxyService
from src.application.services.registry_service import RegistryService
from src.application.services.user_management_service import UserManagementService
from src.domain.exceptions import DomainError
from src.infrastructure.adapters.identity_manager_client import IdentityManagerClient
from src.infrastructure.adapters.in_memory_circuit_breaker import InMemoryCircuitBreaker
from src.infrastructure.adapters.user_profile_client import UserProfileClient
from src.infrastructure.messaging.eventbridge_publisher import EventBridgePublisher
from src.infrastructure.messaging.eventbridge_subscriber import (
    SUBSCRIBED_EVENT_TYPES,
    EventBridgeSubscriber,
)
from src.infrastructure.persistence.dynamodb_audit_log_repository import DynamoDBAuditLogRepository
from src.infrastructure.persistence.dynamodb_service_registry_repository import (
    DynamoDBServiceRegistryRepository,
)
from src.infrastructure.seed.seed_loader import load_seed_services
from src.presentation.api.v1 import (
    audit,
    auth,
    config,
    health,
    health_check,
    internal_events,
    proxy,
    registry,
    users,
)
from src.presentation.middleware.audit_logging import AuditLoggingMiddleware
from src.presentation.middleware.body_size_limit import BodySizeLimitMiddleware
from src.presentation.middleware.correlation_id import CorrelationIdMiddleware
from src.presentation.middleware.cors import add_cors_middleware
from src.presentation.middleware.csrf import CsrfMiddleware
from src.presentation.middleware.jwt_validation import JwtValidationMiddleware
from src.presentation.middleware.rate_limiting import RateLimitingMiddleware
from src.presentation.middleware.security_headers import SecurityHeadersMiddleware

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

_SEED_CONFIG_PATH = os.environ.get("SEED_CONFIG_PATH", "config/seed_services.json")


# ---------------------------------------------------------------------------
# Lifespan — startup and shutdown
# ---------------------------------------------------------------------------


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Application lifespan: wire DI on startup, clean up on shutdown."""
    logger.info("bff_startup_begin")

    # --- Infrastructure: circuit breakers ---
    identity_cb = InMemoryCircuitBreaker(
        name="identity_manager",
        failure_threshold=5,
        cooldown_seconds=30.0,
    )
    profile_cb = InMemoryCircuitBreaker(
        name="user_profile_service",
        failure_threshold=5,
        cooldown_seconds=30.0,
    )

    # --- Infrastructure: HTTP adapters ---
    identity_client = IdentityManagerClient(circuit_breaker=identity_cb)
    profile_client = UserProfileClient(circuit_breaker=profile_cb)

    # --- Infrastructure: repositories ---
    registry_repo = DynamoDBServiceRegistryRepository()
    audit_log_repo = DynamoDBAuditLogRepository()

    # --- Infrastructure: event publisher ---
    event_publisher = EventBridgePublisher()

    # --- Application services ---
    auth_service = AuthService(
        identity_client=identity_client,
        profile_client=profile_client,
    )
    registry_service = RegistryService(
        registry_repo=registry_repo,
        event_publisher=event_publisher,
    )
    proxy_service = ProxyService(registry_repo=registry_repo)
    health_aggregator_service = HealthAggregatorService(
        registry_repo=registry_repo,
        event_publisher=event_publisher,
        poll_interval=int(os.environ.get("HEALTH_POLL_INTERVAL", "60")),
    )
    user_management_service = UserManagementService(
        identity_client=identity_client,
        profile_client=profile_client,
    )
    config_service = ConfigService(
        registry_repo=registry_repo,
        event_publisher=event_publisher,
    )
    audit_service = AuditService(audit_log_repo=audit_log_repo)
    event_processing_service = EventProcessingService()

    # --- Infrastructure: EventBridge subscriber ---
    # Wire all subscribed event types to EventProcessingService.process_event
    # so that incoming EventBridge events are routed correctly (Req 12.1).
    event_subscriber = EventBridgeSubscriber(
        handlers={event_type: event_processing_service.process_event for event_type in SUBSCRIBED_EVENT_TYPES}
    )

    # --- Attach to app.state for dependency injection ---
    app.state.registry_repo = registry_repo
    app.state.audit_log_repo = audit_log_repo
    app.state.event_publisher = event_publisher
    app.state.auth_service = auth_service
    app.state.registry_service = registry_service
    app.state.proxy_service = proxy_service
    app.state.health_aggregator_service = health_aggregator_service
    app.state.user_management_service = user_management_service
    app.state.config_service = config_service
    app.state.audit_service = audit_service
    app.state.event_processing_service = event_processing_service
    app.state.event_subscriber = event_subscriber

    # --- Load seed services ---
    try:
        await load_seed_services(registry_repo, config_path=_SEED_CONFIG_PATH)
        logger.info("seed_services_loaded")
    except Exception as exc:
        logger.error("seed_services_load_failed", error=str(exc))

    # --- Initial health poll (eager, synchronous) ---
    # In Lambda, background asyncio tasks created by start_polling() may never
    # execute between invocations.  Running poll_once() here ensures the cache
    # is populated before the first request is served, regardless of execution model.
    try:
        await health_aggregator_service.poll_once()
        logger.info("health_initial_poll_complete")
    except Exception as exc:
        # Non-fatal — cache stays empty; the dashboard will show "no services" until
        # the next poll cycle rather than crashing startup.
        logger.warning("health_initial_poll_failed", error=str(exc))

    # --- Start health polling (background loop for long-running containers) ---
    await health_aggregator_service.start_polling()

    logger.info("bff_startup_complete")

    yield  # Application is running.

    # --- Shutdown ---
    logger.info("bff_shutdown_begin")
    await health_aggregator_service.stop_polling()
    logger.info("bff_shutdown_complete")


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Admin Panel BFF Proxy",
        description="Backend-for-Frontend proxy for the ugsys Admin Panel.",
        version="0.1.0",
        lifespan=lifespan,
        # Disable default exception handlers — we use our own.
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # -----------------------------------------------------------------------
    # CORS — must be added before other middleware (Req 13.2)
    # -----------------------------------------------------------------------
    add_cors_middleware(app)

    # -----------------------------------------------------------------------
    # Body size limit — raw ASGI middleware, runs before FastAPI parses body
    # (Req 13.3)
    # -----------------------------------------------------------------------
    app.add_middleware(BodySizeLimitMiddleware)

    # -----------------------------------------------------------------------
    # Middleware stack — registered in reverse execution order.
    # FastAPI/Starlette applies middleware in LIFO order, so the LAST
    # add_middleware call runs FIRST on the request.
    #
    # Desired execution order (outermost → innermost):
    #   Correlation ID → Security Headers → CSRF → Rate Limiting → JWT → Audit
    #
    # Registration order (innermost → outermost):
    # -----------------------------------------------------------------------
    app.add_middleware(AuditLoggingMiddleware)  # 6. innermost
    app.add_middleware(JwtValidationMiddleware)  # 5.
    app.add_middleware(RateLimitingMiddleware)  # 4.
    app.add_middleware(CsrfMiddleware)  # 3.
    app.add_middleware(SecurityHeadersMiddleware)  # 2.
    app.add_middleware(CorrelationIdMiddleware)  # 1. outermost

    # -----------------------------------------------------------------------
    # Exception handlers — translate domain exceptions to JSON responses
    # -----------------------------------------------------------------------
    @app.exception_handler(DomainError)
    async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.http_status,
            content={
                "error": exc.error_code,
                "message": exc.message,
                "data": {},
            },
        )

    # -----------------------------------------------------------------------
    # Routers
    # -----------------------------------------------------------------------
    api_prefix = "/api/v1"

    # BFF own health check — no /api/v1 prefix (public endpoint).
    app.include_router(health_check.router)

    # Auth routes.
    app.include_router(auth.router, prefix=api_prefix)

    # Registry routes.
    app.include_router(registry.router, prefix=api_prefix)

    # Proxy routes — includes both the generic proxy and config endpoint.
    # Config router uses /api/v1/proxy/{service_name}/config path.
    app.include_router(config.router, prefix=api_prefix)
    app.include_router(proxy.router, prefix=api_prefix)

    # Health aggregation routes.
    app.include_router(health.router, prefix=api_prefix)

    # User management routes.
    app.include_router(users.router, prefix=api_prefix)

    # Audit log routes.
    app.include_router(audit.router, prefix=api_prefix)

    # Internal event ingestion endpoint (EventBridge → BFF).
    # Not prefixed under /api/v1/ — infrastructure-level access only.
    app.include_router(internal_events.router)

    return app


# ---------------------------------------------------------------------------
# Application instance
# ---------------------------------------------------------------------------

app = create_app()
