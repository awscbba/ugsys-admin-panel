# Requirements Document

## Introduction

The Admin Panel is a plugin-based unified administration interface for the ugsys platform. It consists of a React Single-Page Application (SPA) shell that discovers and renders micro-frontends contributed by independent microservices, and a Backend-for-Frontend (BFF) proxy that aggregates API calls, enforces RBAC, and manages service registration. Each microservice in the ugsys ecosystem registers itself with the Admin Panel, exports its configuration metadata, and contributes UI fragments that the shell composes at runtime. Authentication, authorization, user profiles, and role information are sourced from the Identity Manager and User Profile Service.

## Glossary

- **Admin_Shell**: The React SPA host application that provides the layout, navigation, authentication context, and micro-frontend mounting infrastructure.
- **BFF_Proxy**: The Backend-for-Frontend server (Python/FastAPI) that sits between the Admin_Shell and downstream microservices, handling auth token relay, request proxying, service registry reads, and RBAC enforcement.
- **Service_Registry**: A DynamoDB-backed catalog where microservices register their metadata (name, version, health endpoint, contributed routes, required roles) so the Admin Panel can discover them.
- **Plugin_Manifest**: A JSON document that a registered microservice exposes at a well-known endpoint, describing the micro-frontend assets (JS bundle URL, CSS URL), navigation entries, required roles, and configuration schema the service contributes to the Admin Panel.
- **Micro_Frontend**: A self-contained JavaScript bundle contributed by a microservice that the Admin_Shell loads and mounts into a designated container at runtime.
- **Identity_Manager**: The `ugsys-identity-manager` service responsible for authentication, JWT issuance, user CRUD, and role management.
- **User_Profile_Service**: The `ugsys-user-profile-service` service responsible for user profile data (display name, avatar, preferences, contact info).
- **RBAC**: Role-Based Access Control. Roles (`super_admin`, `admin`, `moderator`, `auditor`, `member`, `guest`, `system`) are carried in the JWT and enforced by the BFF_Proxy and Admin_Shell.
- **Navigation_Entry**: A menu item descriptor (label, icon, path, required roles, parent group) contributed by a Plugin_Manifest that the Admin_Shell renders in the sidebar.
- **Health_Aggregator**: A BFF_Proxy component that periodically polls registered services' health endpoints and exposes an aggregated health status to the Admin_Shell dashboard.
- **Admin_User**: A user with one of the administrative roles (`super_admin`, `admin`, `moderator`, `auditor`) who is authorized to access the Admin Panel.

## Requirements

### Requirement 1: Admin Shell Application Bootstrap

**User Story:** As an Admin_User, I want a single-page application shell that loads quickly and provides consistent navigation, so that I can access all administrative functions from one place.

#### Acceptance Criteria

1. WHEN an Admin_User navigates to the Admin Panel URL, THE Admin_Shell SHALL render a login screen if no valid session exists.
2. WHEN a valid JWT session exists, THE Admin_Shell SHALL render the main layout with a sidebar, top bar, and content area within 3 seconds of initial page load.
3. THE Admin_Shell SHALL display the Admin_User's display name and avatar in the top bar, sourced from the User_Profile_Service via the BFF_Proxy.
4. THE Admin_Shell SHALL provide a sidebar navigation that renders Navigation_Entry items grouped by service and filtered by the Admin_User's roles.
5. WHEN the Admin_User clicks a Navigation_Entry, THE Admin_Shell SHALL route to the corresponding path and mount the associated Micro_Frontend in the content area.
6. THE Admin_Shell SHALL include a global error boundary that catches rendering failures in any Micro_Frontend and displays a fallback UI without crashing the entire application.
7. IF the JWT expires during an active session, THEN THE Admin_Shell SHALL attempt a silent token refresh and, if refresh fails, redirect the Admin_User to the login screen.

### Requirement 2: Authentication and Session Management

**User Story:** As an Admin_User, I want to authenticate securely and maintain my session, so that I can work without repeated logins while keeping the panel secure.

#### Acceptance Criteria

1. WHEN an Admin_User submits login credentials, THE BFF_Proxy SHALL forward the authentication request to the Identity_Manager `/api/v1/auth/login` endpoint.
2. WHEN the Identity_Manager returns a valid token pair (access + refresh), THE BFF_Proxy SHALL set the access token as an `httpOnly`, `Secure`, `SameSite=Lax` cookie and return the token expiry to the Admin_Shell.
3. THE BFF_Proxy SHALL validate the JWT on every proxied request using RS256 algorithm verification, audience check, issuer check, and expiration check before forwarding to downstream services.
4. WHEN the access token is within 60 seconds of expiration and a valid refresh token exists, THE BFF_Proxy SHALL transparently refresh the token pair with the Identity_Manager and update the cookie.
5. IF the refresh token is expired or invalid, THEN THE BFF_Proxy SHALL return HTTP 401 and clear the session cookies.
6. THE BFF_Proxy SHALL reject tokens using algorithms other than RS256, including `HS256` and `none`.
7. WHEN an Admin_User clicks the logout button, THE BFF_Proxy SHALL invalidate the session, clear all auth cookies, and call the Identity_Manager logout endpoint.
8. THE BFF_Proxy SHALL implement CSRF protection using the Double Submit Cookie pattern for all state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`).

### Requirement 3: Role-Based Access Control Enforcement

**User Story:** As a platform operator, I want the Admin Panel to enforce role-based access at both the UI and API layers, so that users can only see and do what their roles permit.

#### Acceptance Criteria

1. THE BFF_Proxy SHALL extract the `roles` array from the validated JWT and attach the roles to the proxied request context.
2. WHEN a proxied request targets a route that requires specific roles (as declared in the Plugin_Manifest), THE BFF_Proxy SHALL verify the Admin_User possesses at least one of the required roles before forwarding the request.
3. IF the Admin_User lacks the required roles for a requested route, THEN THE BFF_Proxy SHALL return HTTP 403 with error code `FORBIDDEN` and a safe user message.
4. THE Admin_Shell SHALL hide Navigation_Entry items for which the Admin_User does not have the required roles.
5. THE Admin_Shell SHALL disable or hide UI actions within a Micro_Frontend when the Admin_User's roles do not include the action's required role, using a shared RBAC context provider.
6. WHEN the Identity_Manager emits an `identity.user.role_changed` event, THE BFF_Proxy SHALL invalidate cached role data for the affected user so that subsequent requests reflect the updated roles.
7. THE BFF_Proxy SHALL enforce that only users with `super_admin`, `admin`, `moderator`, or `auditor` roles can access the Admin Panel; users with only `member`, `guest`, or `system` roles SHALL receive HTTP 403.

### Requirement 4: Service Registration and Discovery

**User Story:** As a microservice developer, I want to register my service with the Admin Panel so that it appears in the admin UI and my micro-frontend is loaded automatically.

#### Acceptance Criteria

1. THE BFF_Proxy SHALL expose a `POST /api/v1/registry/services` endpoint that accepts service registration requests containing: service name, base URL, health endpoint path, Plugin_Manifest URL, and required minimum role for access.
2. WHEN a valid registration request is received with a valid service-to-service JWT (`client_credentials` grant), THE BFF_Proxy SHALL persist the registration in the Service_Registry.
3. IF a registration request is received for a service name that already exists, THEN THE BFF_Proxy SHALL update the existing registration record with the new metadata and increment the version.
4. THE BFF_Proxy SHALL expose a `GET /api/v1/registry/services` endpoint that returns all registered services, filtered by the requesting Admin_User's roles.
5. WHEN a service is registered or updated, THE BFF_Proxy SHALL fetch and validate the Plugin_Manifest from the declared manifest URL and store the manifest contents alongside the registration.
6. IF the Plugin_Manifest URL is unreachable or returns invalid JSON, THEN THE BFF_Proxy SHALL mark the service registration as `degraded` and log a warning with the service name and error details.
7. THE BFF_Proxy SHALL expose a `DELETE /api/v1/registry/services/{service_name}` endpoint that removes a service registration, restricted to `super_admin` role.
8. WHEN a service is deregistered, THE BFF_Proxy SHALL emit an `admin.service.deregistered` event to the `ugsys-event-bus`.

### Requirement 5: Plugin Manifest Contract

**User Story:** As a microservice developer, I want a clear manifest contract so that I know exactly what metadata to expose for the Admin Panel to consume my micro-frontend.

#### Acceptance Criteria

1. THE BFF_Proxy SHALL validate every Plugin_Manifest against a JSON Schema that requires: `name` (string), `version` (semver string), `entryPoint` (URL to JS bundle), `routes` (array of route descriptors), and `navigation` (array of Navigation_Entry descriptors).
2. WHEN a Plugin_Manifest includes optional fields (`stylesheetUrl`, `configSchema`, `healthEndpoint`, `requiredPermissions`), THE BFF_Proxy SHALL store and serve the optional fields alongside the required fields.
3. EACH route descriptor in the Plugin_Manifest SHALL contain: `path` (relative URL), `requiredRoles` (array of role strings), and `label` (display string).
4. EACH Navigation_Entry descriptor SHALL contain: `label` (string), `icon` (string identifier), `path` (relative URL), `requiredRoles` (array of role strings), and optionally `group` (string for sidebar grouping) and `order` (integer for sort priority).
5. IF a Plugin_Manifest fails JSON Schema validation, THEN THE BFF_Proxy SHALL reject the manifest, return a descriptive validation error to the registering service, and log the validation failures.
6. THE BFF_Proxy SHALL serialize validated Plugin_Manifest objects back into valid JSON (round-trip: parse then serialize then parse SHALL produce an equivalent object).

### Requirement 6: Micro-Frontend Loading and Mounting

**User Story:** As an Admin_User, I want micro-frontends from different services to load seamlessly within the admin shell, so that I get a unified experience without page reloads.

#### Acceptance Criteria

1. WHEN the Admin_Shell needs to render a route owned by a registered service, THE Admin_Shell SHALL dynamically import the Micro_Frontend JS bundle from the URL declared in the Plugin_Manifest `entryPoint`.
2. THE Admin_Shell SHALL mount each Micro_Frontend into an isolated container element, passing a shared context object containing: the authenticated user's ID, roles, display name, auth token accessor, and a navigation API.
3. WHILE a Micro_Frontend bundle is loading, THE Admin_Shell SHALL display a loading skeleton in the content area.
4. IF a Micro_Frontend bundle fails to load (network error, 404, or JS parse error), THEN THE Admin_Shell SHALL display an error message identifying the failed service and provide a retry button.
5. THE Admin_Shell SHALL unload (unmount and clean up) the previous Micro_Frontend before mounting a new one during route transitions.
6. THE Admin_Shell SHALL enforce a Content Security Policy that allows script sources only from the Admin Panel's own origin and the registered Micro_Frontend bundle origins.
7. WHEN a Micro_Frontend calls the navigation API to change routes, THE Admin_Shell SHALL handle the navigation within the SPA router without a full page reload.

### Requirement 7: BFF Proxy Request Routing

**User Story:** As an Admin_User, I want the admin panel to proxy my API requests to the correct downstream service, so that I do not need to know individual service URLs.

#### Acceptance Criteria

1. WHEN the Admin_Shell makes an API request to `/api/v1/proxy/{service_name}/{path}`, THE BFF_Proxy SHALL resolve the target service base URL from the Service_Registry and forward the request.
2. THE BFF_Proxy SHALL attach the Admin_User's JWT as a Bearer token in the `Authorization` header of the proxied request to the downstream service.
3. THE BFF_Proxy SHALL propagate the `X-Request-ID` correlation header from the incoming request to the downstream service request.
4. IF the target service is not found in the Service_Registry, THEN THE BFF_Proxy SHALL return HTTP 404 with error code `SERVICE_NOT_FOUND`.
5. IF the downstream service does not respond within 10 seconds, THEN THE BFF_Proxy SHALL return HTTP 504 with error code `GATEWAY_TIMEOUT` and log the timeout with the service name and path.
6. THE BFF_Proxy SHALL apply rate limiting of 60 requests per minute per authenticated Admin_User (identified by JWT `sub` claim) across all proxied routes.
7. THE BFF_Proxy SHALL strip internal headers (`X-Forwarded-For`, `X-Real-IP`) from downstream responses before returning them to the Admin_Shell.
8. WHEN the downstream service returns an error response (4xx or 5xx), THE BFF_Proxy SHALL forward the status code and safe error body to the Admin_Shell without exposing internal service details.

### Requirement 8: Health Aggregation Dashboard

**User Story:** As an Admin_User with `admin` or `super_admin` role, I want a dashboard showing the health status of all registered services, so that I can quickly identify service issues.

#### Acceptance Criteria

1. THE Health_Aggregator SHALL poll each registered service's health endpoint at a configurable interval (default: 60 seconds).
2. THE BFF_Proxy SHALL expose a `GET /api/v1/health/services` endpoint that returns the aggregated health status of all registered services, restricted to `admin` and `super_admin` roles.
3. EACH service health entry SHALL include: service name, status (`healthy`, `degraded`, `unhealthy`, `unknown`), last check timestamp, response time in milliseconds, and version string.
4. IF a service health endpoint does not respond within 5 seconds, THEN THE Health_Aggregator SHALL mark the service as `unhealthy` and log the timeout.
5. IF a service health endpoint returns a non-2xx status code, THEN THE Health_Aggregator SHALL mark the service as `degraded` and include the status code in the health entry.
6. WHEN a service transitions from `healthy` to `unhealthy`, THE Health_Aggregator SHALL emit an `admin.service.health_changed` event to the `ugsys-event-bus` with the service name and new status.
7. THE Admin_Shell SHALL render the health dashboard as a built-in view (not a Micro_Frontend) showing service cards with color-coded status indicators.

### Requirement 9: Admin User Management View

**User Story:** As a `super_admin`, I want to manage platform users from the Admin Panel, so that I can activate, deactivate, and change roles without accessing the Identity Manager directly.

#### Acceptance Criteria

1. THE Admin_Shell SHALL provide a built-in user management view accessible only to users with `super_admin` or `admin` roles.
2. WHEN the user management view loads, THE BFF_Proxy SHALL fetch the user list from the Identity_Manager `GET /api/v1/users` endpoint and enrich each entry with profile data from the User_Profile_Service `GET /api/v1/profiles/{user_id}`.
3. THE user management view SHALL display a paginated, searchable table with columns: display name, email, roles, status, and last login timestamp.
4. WHEN a `super_admin` changes a user's role, THE BFF_Proxy SHALL forward the role change request to the Identity_Manager `PATCH /api/v1/users/{user_id}/roles` endpoint.
5. WHEN a `super_admin` or `admin` deactivates a user, THE BFF_Proxy SHALL forward the deactivation request to the Identity_Manager `PATCH /api/v1/users/{user_id}/status` endpoint.
6. IF the Identity_Manager or User_Profile_Service is unavailable during a user management operation, THEN THE BFF_Proxy SHALL return HTTP 502 with error code `EXTERNAL_SERVICE_ERROR` and a safe user message.
7. THE BFF_Proxy SHALL use a circuit breaker when calling the Identity_Manager and User_Profile_Service, opening after 5 consecutive failures with a 30-second cooldown.

### Requirement 10: Configuration Management

**User Story:** As an Admin_User with appropriate roles, I want to view and update service configurations through the Admin Panel, so that I can manage service settings centrally.

#### Acceptance Criteria

1. WHEN a Plugin_Manifest includes a `configSchema` field (JSON Schema), THE BFF_Proxy SHALL store the schema and expose it via `GET /api/v1/registry/services/{service_name}/config-schema`.
2. THE Admin_Shell SHALL render a dynamic configuration form based on the `configSchema` JSON Schema, supporting string, number, boolean, enum, and nested object field types.
3. WHEN an Admin_User submits a configuration change, THE BFF_Proxy SHALL forward the configuration payload to the target service's configuration endpoint as declared in the Plugin_Manifest.
4. THE BFF_Proxy SHALL validate the submitted configuration against the `configSchema` before forwarding to the target service.
5. IF the submitted configuration fails schema validation, THEN THE BFF_Proxy SHALL return HTTP 422 with descriptive validation errors and not forward the request.
6. WHEN a configuration change is successfully applied, THE BFF_Proxy SHALL log the change with the Admin_User's ID, service name, and a diff of changed fields (excluding sensitive values).
7. THE configuration management view SHALL be restricted to users with `super_admin` or `admin` roles.

### Requirement 11: Audit Logging

**User Story:** As an `auditor`, I want to see a log of administrative actions performed through the Admin Panel, so that I can review changes for compliance.

#### Acceptance Criteria

1. THE BFF_Proxy SHALL log every state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`) that passes through the proxy with: timestamp, Admin_User ID, Admin_User roles, target service, target path, HTTP method, and response status code.
2. THE BFF_Proxy SHALL expose a `GET /api/v1/audit/logs` endpoint that returns paginated audit log entries, restricted to `auditor`, `admin`, and `super_admin` roles.
3. EACH audit log entry SHALL include: timestamp (ISO 8601), actor user ID, actor display name, action description, target service, target resource path, HTTP method, response status, and correlation ID.
4. THE BFF_Proxy SHALL persist audit log entries in a dedicated DynamoDB table with a TTL of 365 days.
5. WHEN querying audit logs, THE BFF_Proxy SHALL support filtering by: date range, actor user ID, target service, and HTTP method.
6. THE Admin_Shell SHALL render the audit log view as a built-in view with a filterable, sortable, paginated table.
7. THE BFF_Proxy SHALL ensure audit log entries are immutable once written; no update or delete operations SHALL be permitted on audit log records.

### Requirement 12: Event Integration

**User Story:** As a platform operator, I want the Admin Panel to react to platform events, so that the dashboard reflects real-time changes from other services.

#### Acceptance Criteria

1. THE BFF_Proxy SHALL subscribe to relevant events on the `ugsys-event-bus`: `identity.user.created`, `identity.user.updated`, `identity.user.deleted`, `identity.user.role_changed`, `identity.auth.login_failed`.
2. WHEN an `identity.user.role_changed` event is received, THE BFF_Proxy SHALL invalidate any cached role or user data for the affected user.
3. WHEN an `identity.auth.login_failed` event is received with a failure count exceeding 10 within 1 hour for the same user, THE BFF_Proxy SHALL flag the user in the dashboard as having suspicious login activity.
4. THE BFF_Proxy SHALL emit events to the `ugsys-event-bus` for significant admin actions: `admin.service.registered`, `admin.service.deregistered`, `admin.service.health_changed`, `admin.config.updated`.
5. THE BFF_Proxy SHALL process incoming events idempotently; receiving the same event multiple times SHALL produce the same result as receiving the event once.
6. IF event processing fails, THEN THE BFF_Proxy SHALL log the failure with the event type, event ID, and error details, and continue processing subsequent events.

### Requirement 13: Security Hardening

**User Story:** As a platform operator, I want the Admin Panel to follow all platform security standards, so that the administrative interface is not a vulnerability vector.

#### Acceptance Criteria

1. THE BFF_Proxy SHALL include security response headers on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`.
2. THE BFF_Proxy SHALL enforce CORS with an explicit origin allowlist (including `https://admin.apps.cloud.org.bo`) and reject requests from unlisted origins.
3. THE BFF_Proxy SHALL enforce a request body size limit of 1 MB on all proxied requests.
4. THE BFF_Proxy SHALL sanitize all user-provided string inputs using HTML entity encoding before logging or storing the values.
5. THE BFF_Proxy SHALL remove the `Server` response header from all responses to prevent technology fingerprinting.
6. THE Admin_Shell SHALL set a strict Content Security Policy that disallows inline scripts (`unsafe-inline`), inline styles from untrusted sources, and `eval()`.
7. THE BFF_Proxy SHALL log all authentication failures with the source IP, requested path, and timestamp, without including credentials or tokens in the log entry.
8. THE BFF_Proxy SHALL implement rate limiting for the login endpoint at 10 requests per minute per source IP to mitigate brute-force attacks.
