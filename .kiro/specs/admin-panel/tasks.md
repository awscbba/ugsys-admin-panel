# Implementation Plan: Admin Panel

## Overview

Incremental implementation of the Admin Panel BFF Proxy (Python/FastAPI) and Admin Shell (React/TypeScript SPA). Tasks are ordered to build foundational layers first (domain, infrastructure, middleware), then application services, then frontend, and finally integration wiring. Each task references specific requirements and design properties. TDD (Red → Green → Refactor) is mandatory throughout.

## Tasks

- [x] 1. BFF project scaffolding and domain layer
  - [x] 1.1 Initialize BFF project structure with hexagonal architecture
    - Create `src/` directory tree: `presentation/api/v1/`, `presentation/middleware/`, `application/services/`, `application/commands/`, `application/queries/`, `application/dtos/`, `application/interfaces/`, `domain/entities/`, `domain/value_objects/`, `domain/repositories/`, `infrastructure/persistence/`, `infrastructure/adapters/`, `infrastructure/messaging/`, `infrastructure/seed/`
    - Create `pyproject.toml` with dependencies (fastapi, uvicorn, pydantic, boto3, httpx, structlog, python-jose, jsonschema) and ruff/bandit/mypy config
    - Create `justfile` with targets: `dev`, `test`, `lint`, `format`, `type-check`, `install-hooks`
    - Create `config/seed_services.json` with the 5 platform seed services
    - _Requirements: All (project foundation)_

  - [x] 1.2 Implement domain value objects (Role, ServiceStatus, HealthState, RouteDescriptor, NavigationEntry)
    - Create `src/domain/value_objects/role.py` with `AdminRole` enum and `ADMIN_ROLES`, `NON_ADMIN_ROLES` sets
    - Create `src/domain/value_objects/service_status.py` with `ServiceStatus` enum
    - Create `src/domain/value_objects/health_state.py` with `HealthState` enum
    - Create `src/domain/value_objects/route_descriptor.py` with frozen `RouteDescriptor` dataclass
    - Create `src/domain/value_objects/navigation_entry.py` with frozen `NavigationEntry` dataclass
    - _Requirements: 3.7, 5.3, 5.4, 8.3_

  - [x] 1.3 Implement domain entities (ServiceRegistration, PluginManifest, AuditLogEntry, HealthStatus, AdminUser)
    - Create `src/domain/entities/service_registration.py` with `ServiceRegistration` dataclass including `registration_source` field
    - Create `src/domain/entities/plugin_manifest.py` with `PluginManifest` dataclass and nested route/navigation types
    - Create `src/domain/entities/audit_log_entry.py` with `AuditLogEntry` dataclass
    - Create `src/domain/entities/health_status.py` with `HealthStatus` dataclass
    - Create `src/domain/entities/admin_user.py` with `AdminUser` dataclass
    - _Requirements: 4.2, 5.1, 8.3, 11.3_

  - [x] 1.4 Define repository port interfaces (ABCs)
    - Create `src/domain/repositories/service_registry_repository.py` — ABC with `save`, `get_by_name`, `list_all`, `delete`, `upsert_seed` methods
    - Create `src/domain/repositories/audit_log_repository.py` — ABC with `save`, `query` methods (no update/delete)
    - Create `src/domain/repositories/event_publisher.py` — ABC with `publish` method
    - Create `src/domain/repositories/identity_client.py` — ABC with `authenticate`, `refresh_token`, `logout`, `list_users`, `update_roles`, `update_status` methods
    - Create `src/domain/repositories/profile_client.py` — ABC with `get_profile`, `get_profiles` methods
    - Create `src/domain/repositories/circuit_breaker.py` — ABC with `call`, `state` property
    - _Requirements: 4.2, 9.7, 11.7_

  - [x] 1.5 Implement domain exceptions
    - Create `src/domain/exceptions.py` with exception hierarchy: `ValidationError`, `NotFoundError`, `ConflictError`, `AuthenticationError`, `AuthorizationError`, `ExternalServiceError`, `RepositoryError`, `GatewayTimeoutError`, `RateLimitError`, `PayloadTooLargeError`
    - Each exception carries `error_code` and safe `message` fields
    - _Requirements: 7.4, 7.5, 9.6, 10.5, 13.3_

  - [ ]* 1.6 Write unit tests for domain value objects and entities
    - Test enum membership, frozen dataclass immutability, default values
    - Test `ADMIN_ROLES` and `NON_ADMIN_ROLES` set correctness
    - _Requirements: 3.7, 5.3, 5.4_

- [x] 2. Plugin Manifest validation and seed loader
  - [x] 2.1 Implement Plugin Manifest JSON Schema validator
    - Create `src/application/interfaces/manifest_validator.py` with `validate_manifest(data: dict) -> PluginManifest` function
    - Store the JSON Schema from the design document as a Python dict constant
    - Validate required fields: `name`, `version` (semver), `entryPoint` (URL), `routes[]`, `navigation[]`
    - Validate route descriptors: `path`, `requiredRoles[]`, `label`
    - Validate navigation entries: `label`, `icon`, `path`, `requiredRoles[]`, optional `group`, `order`
    - Preserve optional fields: `stylesheetUrl`, `configSchema`, `healthEndpoint`, `requiredPermissions`
    - Return descriptive validation errors on failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 2.2 Write property test: Plugin Manifest schema validation
    - **Property 10: Plugin Manifest schema validation**
    - **Validates: Requirements 5.1, 5.3, 5.4, 5.5**

  - [ ]* 2.3 Write property test: Manifest optional fields preservation
    - **Property 11: Manifest optional fields preservation**
    - **Validates: Requirements 5.2**

  - [ ]* 2.4 Write property test: Manifest serialization round-trip
    - **Property 12: Manifest serialization round-trip**
    - **Validates: Requirements 5.6**

  - [x] 2.5 Implement seed loader
    - Create `src/infrastructure/seed/seed_loader.py` with `load_seed_services(registry_repo, config_path)` function
    - Read `config/seed_services.json`, parse entries
    - For each entry, check environment variable override `SEED_{SERVICE_NAME}_BASE_URL`
    - Upsert into Service Registry (only if entry doesn't exist or seed version is newer)
    - Mark entries with `registration_source: "seed"`
    - _Requirements: 4.1, 4.2_

  - [ ]* 2.6 Write property test: Seed services loaded at startup
    - **Property 37: Seed services loaded at startup**
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 2.7 Write property test: Seed environment variable override
    - **Property 38: Seed environment variable override**
    - **Validates: Requirements 4.1**

- [x] 3. Infrastructure layer — DynamoDB repositories and adapters
  - [x] 3.1 Implement DynamoDB Service Registry repository
    - Create `src/infrastructure/persistence/dynamodb_service_registry_repository.py`
    - Implement `save`, `get_by_name`, `list_all`, `delete`, `upsert_seed` methods
    - Table: `ugsys-admin-registry-{env}` with PK `SERVICE#{service_name}`, SK `SERVICE`
    - GSI `StatusIndex` on `status` + `updated_at`
    - Version increment on re-registration
    - _Requirements: 4.2, 4.3_

  - [x] 3.2 Implement DynamoDB Audit Log repository
    - Create `src/infrastructure/persistence/dynamodb_audit_log_repository.py`
    - Implement `save` and `query` methods (no update/delete — immutability enforced)
    - Table: `ugsys-admin-audit-{env}` with PK `AUDIT#{ulid}`, SK `LOG`
    - GSI `ActorIndex` on `actor_user_id` + `timestamp`, GSI `ServiceIndex` on `target_service` + `timestamp`
    - TTL attribute set to creation timestamp + 365 days
    - Query supports filtering by date range, actor user ID, target service, HTTP method
    - _Requirements: 11.1, 11.4, 11.5, 11.7_

  - [ ]* 3.3 Write property test: Service registration persistence round-trip
    - **Property 7: Service registration persistence round-trip**
    - **Validates: Requirements 4.2**

  - [ ]* 3.4 Write property test: Re-registration version increment
    - **Property 8: Re-registration version increment**
    - **Validates: Requirements 4.3**

  - [ ]* 3.5 Write property test: Audit log TTL is 365 days
    - **Property 26: Audit log TTL is 365 days**
    - **Validates: Requirements 11.4**

  - [ ]* 3.6 Write property test: Audit log immutability
    - **Property 28: Audit log immutability**
    - **Validates: Requirements 11.7**

  - [x] 3.7 Implement circuit breaker
    - Create `src/infrastructure/adapters/in_memory_circuit_breaker.py`
    - States: CLOSED → OPEN (after 5 consecutive failures) → HALF_OPEN (after 30s cooldown) → CLOSED/OPEN
    - OPEN state raises `ExternalServiceError` immediately
    - HALF_OPEN allows single probe request
    - _Requirements: 9.7_

  - [ ]* 3.8 Write property test: Circuit breaker opens after consecutive failures
    - **Property 23: Circuit breaker opens after consecutive failures**
    - **Validates: Requirements 9.7**

  - [x] 3.9 Implement Identity Manager HTTP client adapter
    - Create `src/infrastructure/adapters/identity_manager_client.py`
    - Methods: `authenticate`, `refresh_token`, `logout`, `list_users`, `update_roles`, `update_status`
    - Uses circuit breaker wrapper
    - Targets Identity Manager endpoints: `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`, `/api/v1/users`, `/api/v1/users/{user_id}/roles`, `/api/v1/users/{user_id}/status`
    - _Requirements: 2.1, 9.2, 9.4, 9.5_

  - [x] 3.10 Implement User Profile Service HTTP client adapter
    - Create `src/infrastructure/adapters/user_profile_client.py`
    - Methods: `get_profile`, `get_profiles`
    - Uses circuit breaker wrapper
    - Targets User Profile Service endpoint: `/api/v1/profiles/{user_id}`
    - _Requirements: 1.3, 9.2_

  - [x] 3.11 Implement manifest fetcher adapter
    - Create `src/infrastructure/adapters/manifest_fetcher.py`
    - Fetches Plugin Manifest JSON from declared URL
    - Returns parsed JSON or raises error on unreachable/invalid response
    - _Requirements: 4.5, 4.6_

  - [x] 3.12 Implement EventBridge publisher and subscriber
    - Create `src/infrastructure/messaging/eventbridge_publisher.py` — publishes events to `ugsys-event-bus`
    - Create `src/infrastructure/messaging/eventbridge_subscriber.py` — subscribes to identity events
    - Event types emitted: `admin.service.registered`, `admin.service.deregistered`, `admin.service.health_changed`, `admin.config.updated`
    - Event types subscribed: `identity.user.created`, `identity.user.updated`, `identity.user.deleted`, `identity.user.role_changed`, `identity.auth.login_failed`
    - _Requirements: 4.8, 8.6, 12.1, 12.4_

- [x] 4. Checkpoint — Domain and infrastructure layers
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. BFF middleware stack
  - [x] 5.1 Implement correlation ID middleware
    - Create `src/presentation/middleware/correlation_id.py`
    - Extract `X-Request-ID` from incoming request or generate a new UUID
    - Attach to request state and propagate to response headers
    - _Requirements: 7.3_

  - [x] 5.2 Implement security headers middleware
    - Create `src/presentation/middleware/security_headers.py`
    - Add on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
    - Remove `Server` header from all responses
    - _Requirements: 13.1, 13.5_

  - [ ]* 5.3 Write property test: Security response headers
    - **Property 31: Security response headers**
    - **Validates: Requirements 13.1, 13.5**

  - [x] 5.4 Implement CSRF Double Submit Cookie middleware
    - Create `src/presentation/middleware/csrf.py`
    - Generate CSRF token: `{random_hex}.{timestamp}.{hmac_signature}`
    - Set CSRF cookie: `SameSite=Strict`, NOT httpOnly, `Secure=True`
    - Validate `X-CSRF-Token` header matches cookie on `POST`, `PUT`, `PATCH`, `DELETE` (constant-time comparison)
    - Reject mismatches with HTTP 403
    - _Requirements: 2.8_

  - [ ]* 5.5 Write property test: CSRF validation on state-changing requests
    - **Property 4: CSRF validation on state-changing requests**
    - **Validates: Requirements 2.8**

  - [x] 5.6 Implement rate limiting middleware
    - Create `src/presentation/middleware/rate_limiting.py`
    - Per-user rate limit: 60 requests/min across all proxied routes (keyed by JWT `sub` claim)
    - Per-IP login rate limit: 10 requests/min on `/api/v1/auth/login`
    - Return HTTP 429 with `Retry-After` header when exceeded
    - _Requirements: 7.6, 13.8_

  - [ ]* 5.7 Write property test: Per-user proxy rate limiting
    - **Property 18: Per-user proxy rate limiting**
    - **Validates: Requirements 7.6**

  - [ ]* 5.8 Write property test: Login endpoint rate limiting per IP
    - **Property 36: Login endpoint rate limiting per IP**
    - **Validates: Requirements 13.8**

  - [x] 5.9 Implement JWT validation middleware
    - Create `src/presentation/middleware/jwt_validation.py` (integrated into FastAPI dependency)
    - Extract JWT from httpOnly cookie
    - Validate RS256 signature, audience, issuer, expiration
    - Reject HS256 and `none` algorithms explicitly
    - Attach `user_id`, `email`, `roles[]` to request state
    - Auto-refresh when access token is within 60s of expiry
    - _Requirements: 2.3, 2.4, 2.6_

  - [ ]* 5.10 Write property test: JWT validation rejects invalid tokens
    - **Property 3: JWT validation rejects invalid tokens**
    - **Validates: Requirements 2.3, 2.6**

  - [x] 5.11 Implement CORS middleware
    - Configure FastAPI CORS with explicit origin allowlist including `https://admin.apps.cloud.org.bo`
    - Reject requests from unlisted origins (no `Access-Control-Allow-Origin` header)
    - _Requirements: 13.2_

  - [ ]* 5.12 Write property test: CORS origin allowlist enforcement
    - **Property 32: CORS origin allowlist enforcement**
    - **Validates: Requirements 13.2**

  - [x] 5.13 Implement request body size limit middleware
    - Reject requests with body larger than 1 MB with HTTP 413
    - _Requirements: 13.3_

  - [ ]* 5.14 Write property test: Request body size limit
    - **Property 33: Request body size limit**
    - **Validates: Requirements 13.3**

  - [x] 5.15 Implement input sanitization utility
    - Create `src/infrastructure/logging.py` with HTML entity encoding for user-provided strings (`<`, `>`, `&`, `"`, `'`)
    - Apply sanitization before logging or storing user-provided values
    - _Requirements: 13.4_

  - [ ]* 5.16 Write property test: Input HTML sanitization
    - **Property 34: Input HTML sanitization**
    - **Validates: Requirements 13.4**

  - [x] 5.17 Implement audit logging middleware
    - Create `src/presentation/middleware/audit_logging.py`
    - Intercept all `POST`, `PUT`, `PATCH`, `DELETE` requests
    - Create audit log entry with: timestamp, actor user ID, actor display name, action, target service, target path, HTTP method, response status, correlation ID
    - Persist via audit log repository
    - _Requirements: 11.1, 11.3_

  - [ ]* 5.18 Write property test: Audit log entry completeness
    - **Property 25: Audit log entry completeness**
    - **Validates: Requirements 11.1, 11.3**

- [x] 6. BFF application services
  - [x] 6.1 Implement Auth Service
    - Create `src/application/services/auth_service.py`
    - `login(credentials)` → forward to Identity Manager, return token pair
    - `logout(session)` → call Identity Manager logout
    - `refresh(refresh_token)` → transparent token refresh
    - `get_current_user(user_id)` → JWT data + profile enrichment from User Profile Service
    - _Requirements: 2.1, 2.4, 2.5, 2.7_

  - [x] 6.2 Implement Auth presentation router
    - Create `src/presentation/api/v1/auth.py`
    - `POST /api/v1/auth/login` → set httpOnly, Secure, SameSite=Lax cookie
    - `POST /api/v1/auth/logout` → clear cookies, call Identity Manager logout
    - `POST /api/v1/auth/refresh` → transparent refresh
    - `GET /api/v1/auth/me` → current user info
    - Log auth failures with source IP, path, timestamp (no credentials/tokens)
    - _Requirements: 2.1, 2.2, 2.5, 2.7, 13.7_

  - [ ]* 6.3 Write property test: Cookie security attributes on token set
    - **Property 2: Cookie security attributes on token set**
    - **Validates: Requirements 2.2**

  - [ ]* 6.4 Write property test: Auth failure logging safety
    - **Property 35: Auth failure logging safety**
    - **Validates: Requirements 13.7**

  - [x] 6.5 Implement Registry Service
    - Create `src/application/services/registry_service.py`
    - `register_service(command)` → validate S2S JWT or super_admin, fetch + validate manifest, persist, emit `admin.service.registered` event
    - `list_services(user_roles)` → filter by `min_role` satisfied by user's roles
    - `deregister_service(service_name, force, user_roles)` → enforce super_admin, block seed entries without `force=true`, emit `admin.service.deregistered` event
    - `get_config_schema(service_name)` → return stored `configSchema`
    - Handle degraded status when manifest URL unreachable
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 6.6 Implement Registry presentation router
    - Create `src/presentation/api/v1/registry.py`
    - `POST /api/v1/registry/services` → register/update service
    - `GET /api/v1/registry/services` → list services filtered by roles
    - `DELETE /api/v1/registry/services/{service_name}` → deregister (super_admin only)
    - `GET /api/v1/registry/services/{service_name}/config-schema` → config schema
    - _Requirements: 4.1, 4.4, 4.7, 10.1_

  - [ ]* 6.7 Write property test: Service list role filtering
    - **Property 9: Service list role filtering**
    - **Validates: Requirements 4.4**

  - [ ]* 6.8 Write property test: Seed entry deletion protection
    - **Property 39: Seed entry deletion protection**
    - **Validates: Requirements 4.5**

  - [x] 6.9 Implement Proxy Service
    - Create `src/application/services/proxy_service.py`
    - Resolve target service URL from Service Registry
    - Attach Admin User's JWT as `Authorization: Bearer` header
    - Propagate `X-Request-ID` correlation header
    - Enforce RBAC: check user roles against route's `requiredRoles` from Plugin Manifest
    - Timeout: 10 seconds → HTTP 504 `GATEWAY_TIMEOUT`
    - Strip internal headers (`X-Forwarded-For`, `X-Real-IP`, `Server`) from downstream responses
    - Forward downstream error status codes with safe error body
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8_

  - [x] 6.10 Implement Proxy presentation router
    - Create `src/presentation/api/v1/proxy.py`
    - `ANY /api/v1/proxy/{service_name}/{path:path}` → forward to downstream service
    - _Requirements: 7.1_

  - [ ]* 6.11 Write property test: RBAC route enforcement
    - **Property 5: RBAC route enforcement**
    - **Validates: Requirements 3.2, 3.3**

  - [ ]* 6.12 Write property test: Admin-only panel access
    - **Property 6: Admin-only panel access**
    - **Validates: Requirements 3.7**

  - [ ]* 6.13 Write property test: Proxy URL resolution
    - **Property 14: Proxy URL resolution**
    - **Validates: Requirements 7.1**

  - [ ]* 6.14 Write property test: Proxy request header propagation
    - **Property 15: Proxy request header propagation**
    - **Validates: Requirements 7.2, 7.3**

  - [ ]* 6.15 Write property test: Proxy response internal header stripping
    - **Property 16: Proxy response internal header stripping**
    - **Validates: Requirements 7.7, 13.5**

  - [ ]* 6.16 Write property test: Proxy error response safety
    - **Property 17: Proxy error response safety**
    - **Validates: Requirements 7.8**

  - [x] 6.17 Implement Health Aggregator Service
    - Create `src/application/services/health_aggregator_service.py`
    - Poll each registered service's health endpoint at configurable interval (default: 60s)
    - Timeout per health check: 5 seconds → mark `unhealthy`
    - Non-2xx response → mark `degraded` with status code
    - Status transition `healthy` → `unhealthy` → emit `admin.service.health_changed` event
    - Store results in Health Cache DynamoDB table
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6_

  - [x] 6.18 Implement Health presentation router
    - Create `src/presentation/api/v1/health.py`
    - `GET /api/v1/health/services` → aggregated health status (admin, super_admin only)
    - Each entry: service name, status, last check timestamp, response time ms, version
    - _Requirements: 8.2, 8.3_

  - [ ]* 6.19 Write property test: Health entry completeness
    - **Property 19: Health entry completeness**
    - **Validates: Requirements 8.3**

  - [ ]* 6.20 Write property test: Non-2xx health response marks degraded
    - **Property 20: Non-2xx health response marks degraded**
    - **Validates: Requirements 8.5**

  - [ ]* 6.21 Write property test: Health state transition event emission
    - **Property 21: Health state transition event emission**
    - **Validates: Requirements 8.6**

  - [x] 6.22 Implement User Management Service
    - Create `src/application/services/user_management_service.py`
    - `list_users(query)` → fetch from Identity Manager, enrich with User Profile Service data
    - `change_roles(user_id, roles)` → forward to Identity Manager (super_admin only)
    - `change_status(user_id, status)` → forward to Identity Manager (super_admin, admin)
    - Circuit breaker on both external service calls
    - _Requirements: 9.1, 9.2, 9.4, 9.5, 9.6, 9.7_

  - [x] 6.23 Implement Users presentation router
    - Create `src/presentation/api/v1/users.py`
    - `GET /api/v1/users` → paginated, searchable user list (super_admin, admin only)
    - `PATCH /api/v1/users/{user_id}/roles` → change roles (super_admin only)
    - `PATCH /api/v1/users/{user_id}/status` → activate/deactivate (super_admin, admin)
    - _Requirements: 9.1, 9.4, 9.5_

  - [ ]* 6.24 Write property test: User list enrichment with profile data
    - **Property 22: User list enrichment with profile data**
    - **Validates: Requirements 9.2**

  - [x] 6.25 Implement Config Service
    - Create `src/application/services/config_service.py`
    - `get_config_schema(service_name)` → return stored JSON Schema
    - `submit_config(service_name, payload, user)` → validate against schema, forward to target service, log change with diff
    - Invalid config → HTTP 422 with descriptive errors
    - Restricted to super_admin, admin
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 6.26 Implement Config presentation router
    - Create `src/presentation/api/v1/config.py`
    - `POST /api/v1/proxy/{service_name}/config` → submit config change
    - _Requirements: 10.3_

  - [ ]* 6.27 Write property test: Configuration validation against schema
    - **Property 24: Configuration validation against schema**
    - **Validates: Requirements 10.4, 10.5**

  - [x] 6.28 Implement Audit Service
    - Create `src/application/services/audit_service.py`
    - `query_logs(filters)` → paginated, filterable audit log query
    - Supports filtering by: date range, actor user ID, target service, HTTP method
    - _Requirements: 11.2, 11.5_

  - [x] 6.29 Implement Audit presentation router
    - Create `src/presentation/api/v1/audit.py`
    - `GET /api/v1/audit/logs` → paginated audit log (auditor, admin, super_admin)
    - _Requirements: 11.2_

  - [ ]* 6.30 Write property test: Audit log filtering correctness
    - **Property 27: Audit log filtering correctness**
    - **Validates: Requirements 11.5**

  - [x] 6.31 Implement Event Processing Service
    - Create `src/application/services/event_processing_service.py`
    - Handle `identity.user.role_changed` → invalidate cached role/user data
    - Handle `identity.auth.login_failed` → flag suspicious activity (>10 failures/hour per user)
    - Idempotent processing: same event multiple times produces same result
    - Failed event processing → log failure, continue processing
    - _Requirements: 12.1, 12.2, 12.3, 12.5, 12.6_

  - [ ]* 6.32 Write property test: Suspicious login activity flagging
    - **Property 29: Suspicious login activity flagging**
    - **Validates: Requirements 12.3**

  - [ ]* 6.33 Write property test: Event idempotent processing
    - **Property 30: Event idempotent processing**
    - **Validates: Requirements 12.5**

  - [x] 6.34 Implement BFF health check endpoint
    - Create `src/presentation/api/v1/health_check.py`
    - `GET /health` → BFF own health status
    - _Requirements: All (operational)_

  - [x] 6.35 Wire FastAPI application with all routers, middleware, and dependency injection
    - Create `src/main.py` with FastAPI app
    - Register middleware stack in order: Correlation ID → Security Headers → CSRF → Rate Limiting → JWT Validation
    - Register all API routers under `/api/v1/`
    - Configure CORS with origin allowlist
    - Configure request body size limit (1 MB)
    - Wire dependency injection: repository implementations, service instances, circuit breakers
    - Call seed loader on startup
    - _Requirements: All (integration)_

- [x] 7. Checkpoint — BFF Proxy complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Admin Shell project scaffolding and domain layer
  - [x] 8.1 Initialize Admin Shell React project
    - Create `admin-shell/` directory with Vite + React + TypeScript setup
    - Configure `tsconfig.json` with strict mode
    - Install dependencies: react, react-router-dom, nanostores, @nanostores/react, vitest, @testing-library/react, fast-check, msw
    - Configure ESLint + Prettier
    - Configure vitest with 80% coverage gate
    - _Requirements: All (frontend foundation)_

  - [x] 8.2 Implement frontend domain entities and types
    - Create `admin-shell/src/domain/entities/AdminUser.ts` — user ID, email, roles, display name, avatar
    - Create `admin-shell/src/domain/entities/ServiceRegistration.ts` — service metadata type
    - Create `admin-shell/src/domain/entities/HealthStatus.ts` — health entry type
    - Create `admin-shell/src/domain/entities/AuditLogEntry.ts` — audit log entry type
    - _Requirements: 1.3, 8.3, 11.3_

  - [x] 8.3 Define frontend repository interfaces (ports)
    - Create `admin-shell/src/domain/repositories/AuthRepository.ts` — `login`, `logout`, `refresh`, `getCurrentUser`
    - Create `admin-shell/src/domain/repositories/RegistryRepository.ts` — `listServices`, `getConfigSchema`
    - Create `admin-shell/src/domain/repositories/HealthRepository.ts` — `getHealthStatuses`
    - Create `admin-shell/src/domain/repositories/UserManagementRepository.ts` — `listUsers`, `changeRoles`, `changeStatus`
    - Create `admin-shell/src/domain/repositories/AuditRepository.ts` — `queryLogs`
    - _Requirements: All (frontend architecture)_

- [x] 9. Admin Shell infrastructure layer
  - [x] 9.1 Implement HttpClient singleton
    - Create `admin-shell/src/infrastructure/http/HttpClient.ts`
    - Singleton pattern via `getInstance()`
    - Automatic `Authorization: Bearer` header injection
    - On 401: attempt silent token refresh, retry original request
    - On refresh failure: trigger force logout (no redirect — component handles navigation)
    - Typed JSON methods: `getJson<T>()`, `postJson<T>()`, `putJson<T>()`
    - Include CSRF token header (`X-CSRF-Token`) for state-changing operations
    - _Requirements: 2.4, 2.5, 2.8_

  - [ ]* 9.2 Write property test: HttpClient automatic token refresh on 401
    - **Property 41: HttpClient automatic token refresh on 401**
    - **Validates: Requirements 2.4, 2.5**

  - [x] 9.3 Implement frontend repository adapters
    - Create `admin-shell/src/infrastructure/repositories/HttpAuthRepository.ts`
    - Create `admin-shell/src/infrastructure/repositories/HttpRegistryRepository.ts`
    - Create `admin-shell/src/infrastructure/repositories/HttpHealthRepository.ts`
    - Create `admin-shell/src/infrastructure/repositories/HttpUserManagementRepository.ts`
    - Create `admin-shell/src/infrastructure/repositories/HttpAuditRepository.ts`
    - All use `HttpClient` for API calls, map API DTOs to domain entities
    - _Requirements: All (frontend data access)_

  - [x] 9.4 Implement centralized API config
    - Create `admin-shell/src/config/api.ts` with `API_CONFIG` object containing typed BFF endpoint paths
    - _Requirements: All (frontend configuration)_

- [x] 10. Admin Shell utilities and state management
  - [x] 10.1 Implement FrontendLogger with structured JSON output
    - Create `admin-shell/src/utils/logger.ts`
    - `FrontendLogger` class with `debug`, `info`, `warn`, `error` methods
    - JSON-formatted output with timestamp, level, logger name, message, context
    - Specialized methods: `logApiRequest()`, `logApiResponse()`, `logUserAction()`, `logComponentEvent()`
    - Factory functions: `getServiceLogger()`, `getComponentLogger()`, `getApiLogger()`
    - Environment-aware: `DEBUG` in dev, `INFO` in production
    - _Requirements: 13.7 (frontend logging)_

  - [x] 10.2 Implement secure logging with sensitive field redaction
    - Create `admin-shell/src/utils/secureLogging.ts`
    - `sanitizeObject()` recursively redacts fields matching sensitive patterns (password, token, secret, key, auth, credential, session, cookie, jwt, bearer) with `[REDACTED]`
    - `enableSecureLogging()` overrides `console.log/error/warn` in dev mode to auto-sanitize
    - _Requirements: 13.7_

  - [ ]* 10.3 Write property test: Frontend sensitive field redaction
    - **Property 40: Frontend sensitive field redaction**
    - **Validates: Requirements 13.7**

  - [x] 10.4 Implement error handling utilities
    - Create `admin-shell/src/utils/errorHandling.ts`
    - `ErrorState` type: `{ message, type, code }` where type is `api | network | validation | unknown`
    - `normalizeError()` converts various error types into `ErrorState`
    - Context-specific error message maps for each view
    - _Requirements: 1.6, 6.4_

  - [x] 10.5 Implement nanostores state stores
    - Create `admin-shell/src/stores/authStore.ts` — `$user`, `$isAuthenticated`, `$isLoading`, `$error` atoms; `login()`, `logout()`, `initializeAuth()` actions
    - Create `admin-shell/src/stores/registryStore.ts` — `$services`, `$selectedService` atoms
    - Create `admin-shell/src/stores/healthStore.ts` — `$healthStatuses` atom
    - _Requirements: 1.2, 1.7_

- [x] 11. Admin Shell presentation components
  - [x] 11.1 Implement AppShell layout with Sidebar and TopBar
    - Create `admin-shell/src/presentation/components/layout/AppShell.tsx` — main layout with sidebar, top bar, content area
    - Create `admin-shell/src/presentation/components/layout/Sidebar.tsx` — renders Navigation_Entry items grouped by service, filtered by user roles, sorted by `order`
    - Create `admin-shell/src/presentation/components/layout/TopBar.tsx` — display name, avatar, logout button
    - Render login screen if no valid session exists
    - Main layout renders within 3 seconds of initial page load
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 11.2 Write property test: Navigation entry role filtering
    - **Property 1: Navigation entry role filtering**
    - **Validates: Requirements 1.4, 3.4**

  - [x] 11.3 Implement ErrorBoundary component
    - Create `admin-shell/src/presentation/components/ErrorBoundary.tsx`
    - Global error boundary catches rendering failures, logs via FrontendLogger, shows fallback UI with retry button
    - Per-micro-frontend error boundaries: each loaded micro-frontend gets its own boundary
    - Dev-only error details in `<details>` element (hidden in production)
    - _Requirements: 1.6, 6.4_

  - [x] 11.4 Implement SessionMonitor component
    - Create `admin-shell/src/presentation/components/SessionMonitor.tsx`
    - Polls token expiry every 30 seconds
    - Shows warning toast when token is within 5 minutes of expiry
    - Displays countdown timer in warning
    - "Continue Session" button triggers silent token refresh
    - Auto-logout when token expires
    - _Requirements: 1.7, 2.4_

  - [x] 11.5 Implement micro-frontend loader and mounting system
    - Dynamic import from Plugin Manifest `entryPoint` URL
    - Isolated container element per micro-frontend
    - Pass shared context: user ID, roles, display name, auth token accessor, navigation API
    - Loading skeleton while bundle loads
    - Error message with retry button on load failure (network error, 404, JS parse error)
    - Unmount + cleanup previous micro-frontend on route transition
    - Handle navigation API calls within SPA router (no full page reload)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_

  - [ ]* 11.6 Write property test: CSP includes registered bundle origins
    - **Property 13: CSP includes registered bundle origins**
    - **Validates: Requirements 6.6**

  - [x] 11.7 Implement RBAC context provider
    - Shared RBAC context that micro-frontends and built-in views use
    - Hide Navigation_Entry items for unauthorized roles
    - Disable/hide UI actions when user lacks required role
    - _Requirements: 3.4, 3.5_

  - [x] 11.8 Implement Health Dashboard built-in view
    - Create `admin-shell/src/presentation/components/views/HealthDashboard.tsx`
    - Service cards with color-coded status indicators (healthy=green, degraded=yellow, unhealthy=red, unknown=gray)
    - Display: service name, status, last check timestamp, response time, version
    - Restricted to admin, super_admin roles
    - _Requirements: 8.2, 8.3, 8.7_

  - [x] 11.9 Implement User Management built-in view
    - Create `admin-shell/src/presentation/components/views/UserManagement.tsx`
    - Paginated, searchable table with columns: display name, email, roles, status, last login
    - Role change action (super_admin only)
    - Activate/deactivate action (super_admin, admin)
    - Restricted to super_admin, admin roles
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 11.10 Implement Audit Log built-in view
    - Create `admin-shell/src/presentation/components/views/AuditLog.tsx`
    - Filterable, sortable, paginated table
    - Filters: date range, actor user ID, target service, HTTP method
    - Restricted to auditor, admin, super_admin roles
    - _Requirements: 11.2, 11.5, 11.6_

  - [x] 11.11 Implement dynamic configuration form view
    - Render dynamic form based on `configSchema` JSON Schema
    - Support field types: string, number, boolean, enum, nested object
    - Submit configuration changes through BFF Proxy
    - Restricted to super_admin, admin roles
    - _Requirements: 10.2, 10.3, 10.7_

  - [x] 11.12 Wire React Router with all routes and CSP
    - Configure React Router with routes for: login, dashboard (health), user management, audit log, config, and dynamic micro-frontend routes
    - Set strict Content Security Policy: disallow `unsafe-inline`, `unsafe-eval`, restrict script sources to own origin + registered bundle origins
    - _Requirements: 1.5, 6.6, 13.6_

- [x] 12. Checkpoint — Admin Shell complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. CI/CD pipeline and Git hooks
  - [x] 13.1 Create BFF CI workflow
    - Create `.github/workflows/ci.yml` for BFF Proxy
    - Stages: ruff lint+format → mypy strict → pytest+hypothesis (80% coverage gate) → Bandit → Semgrep → Safety → CycloneDX+Trivy → Gitleaks → architecture guard (hexagonal layer imports)
    - All stages block merge except Safety (advisory) and CodeQL (advisory SARIF)
    - _Requirements: 13 (security pipeline)_

  - [x] 13.2 Create Admin Shell CI workflow
    - Create `.github/workflows/ci-frontend.yml` for Admin Shell
    - Stages: ESLint+Prettier → tsc --noEmit → vitest+fast-check (80% coverage gate) → Semgrep → npm audit → Gitleaks → bundle analysis (advisory)
    - _Requirements: 13 (security pipeline)_

  - [x] 13.3 Create DAST security scan workflow
    - Create `.github/workflows/security-scan.yml`
    - OWASP ZAP against `https://admin.apps.cloud.org.bo`
    - Nuclei against BFF API endpoints (`/api/v1/*`)
    - Runs post-deploy to staging, critical findings block production promotion
    - _Requirements: 13 (security pipeline)_

  - [x] 13.4 Create Git hook scripts
    - Create `scripts/hooks/pre-commit` — block direct commits to main, run ruff on staged Python files, run ESLint+Prettier on staged TS/React files
    - Create `scripts/hooks/pre-push` — block direct push to main, run mypy + tsc --noEmit + full test suite
    - Add `install-hooks` target to justfile
    - _Requirements: 13 (developer workflow)_

  - [x] 13.5 Create CodeQL workflow
    - Create `.github/workflows/codeql.yml` — weekly + on PR, Python security-extended, SARIF upload
    - _Requirements: 13 (security pipeline)_

- [x] 14. Integration wiring and final validation
  - [x] 14.1 Wire BFF event subscriptions to EventBridge
    - Configure EventBridge rules for subscribed events: `identity.user.created`, `identity.user.updated`, `identity.user.deleted`, `identity.user.role_changed`, `identity.auth.login_failed`
    - Wire event handler to Event Processing Service
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 14.2 Wire BFF event emissions
    - Ensure all event-emitting services publish to EventBridge: `admin.service.registered`, `admin.service.deregistered`, `admin.service.health_changed`, `admin.config.updated`
    - _Requirements: 12.4_

  - [ ]* 14.3 Write integration tests for DynamoDB repositories
    - Test Service Registry CRUD with moto
    - Test Audit Log persistence and query with moto
    - Test seed loader with moto
    - _Requirements: 4.2, 11.1, 11.4_

  - [ ]* 14.4 Write integration tests for BFF API endpoints
    - Test full request flow through middleware stack using FastAPI TestClient
    - Test auth flow: login → cookie set → authenticated request → logout
    - Test proxy flow: request → RBAC check → downstream forward → response
    - Test registry flow: register → list → deregister
    - _Requirements: All (integration validation)_

- [x] 15. Final checkpoint — Full system validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints at tasks 4, 7, 12, and 15 ensure incremental validation
- Property tests validate the 41 correctness properties from the design document
- BFF uses Python 3.13+ / FastAPI / hypothesis for property tests
- Admin Shell uses TypeScript / React / fast-check for property tests
- TDD workflow (Red → Green → Refactor) is mandatory for all implementation tasks
- All 13 requirements are covered across the task list
