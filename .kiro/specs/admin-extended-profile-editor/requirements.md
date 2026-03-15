# Requirements Document

## Introduction

This feature extends the existing `EditProfileModal` in the admin panel to also edit fields owned
by the **User Profile Service (UPS)**. The current modal (specified in `admin-user-profile-editor`)
handles Identity Manager fields only (`display_name`, `email`, `password`). This spec adds a second
"Profile" section covering personal, contact, display, and preference fields from UPS.

The extension requires:
- New BFF proxy endpoints that forward to UPS with the admin Bearer token
- A new `UserProfileClient` port and `UserProfileServiceClient` adapter in the frontend
- Pre-population of UPS fields by fetching `GET /api/v1/users/{user_id}/ups-profile` before the modal opens
- Both `admin` and `super_admin` roles may edit all UPS fields (no field-level role restrictions)

The existing IM fields and their role gating are **not re-specified here** — they remain as defined
in `admin-user-profile-editor/requirements.md`.

---

## Glossary

- **Admin_Panel**: The React + TypeScript SPA served by the admin shell.
- **BFF**: The Python FastAPI backend-for-frontend (`ugsys-admin-panel` backend).
- **UPS**: The `ugsys-user-profile-service` upstream service at `https://profiles.apps.cloud.org.bo`.
- **UserProfileClient**: The TypeScript abstract port interface in `src/domain/repositories/UserProfileClient.ts` that declares all UPS-related frontend calls.
- **HttpUserProfileClient**: The concrete TypeScript HTTP adapter in `src/infrastructure/adapters/HttpUserProfileClient.ts` that calls BFF UPS proxy endpoints.
- **UserProfileServiceClient**: The Python ABC in the BFF `src/domain/repositories/user_profile_client.py` that declares all UPS upstream calls.
- **UserProfileServiceAdapter**: The concrete Python HTTP adapter in the BFF `src/infrastructure/adapters/user_profile_service_adapter.py` that calls UPS endpoints with the admin Bearer token.
- **UpsProfile**: The frontend domain entity (`src/domain/entities/UpsProfile.ts`) representing the UPS `UserProfile` fields editable by admins.
- **EditProfileModal**: The existing React modal extended with a "Profile" tab for UPS fields alongside the existing "Identity" tab.
- **Requesting_User**: The authenticated admin or super_admin whose JWT is present in the session cookie.
- **Target_User**: The platform user whose UPS profile is being edited.
- **admin**: Platform role with full access to all UPS fields.
- **super_admin**: Platform role with full access to all UPS fields (same as admin for UPS).
- **Address**: The nested address value object: `street`, `city`, `state`, `postal_code`, `country`.
- **NotificationPreferences**: The nested preferences value object: `email`, `sms`, `whatsapp` booleans.

---

## Requirements

### Requirement 1: UPS Profile Pre-Population

**User Story:** As an admin or super_admin, I want the Edit Profile modal to pre-populate UPS fields with the target user's current values, so that I can see what is already set before making changes.

#### Acceptance Criteria

1. WHEN the `Requesting_User` clicks "Edit" on a user row, THE `Admin_Panel` SHALL call `GET /api/v1/users/{user_id}/ups-profile` via `HttpUserProfileClient` before opening the `EditProfileModal`.
2. WHILE the UPS profile fetch is in progress, THE `Admin_Panel` SHALL display a loading state on the "Edit" button and SHALL NOT open the modal until the fetch completes.
3. WHEN the UPS profile fetch succeeds, THE `Admin_Panel` SHALL open the `EditProfileModal` with all UPS fields pre-populated from the returned `UpsProfile` entity.
4. IF the UPS profile fetch returns HTTP 404, THEN THE `Admin_Panel` SHALL open the `EditProfileModal` with all UPS fields empty (treat as a profile not yet created).
5. IF the UPS profile fetch returns HTTP 5xx or a network error, THEN THE `Admin_Panel` SHALL display a dismissible error banner on the user row and SHALL NOT open the modal.
6. THE `UserProfileClient` port SHALL declare a `getProfile(userId: string): Promise<UpsProfile>` method.
7. THE `HttpUserProfileClient` SHALL implement `getProfile` by calling `GET /api/v1/users/{userId}/ups-profile` and mapping the response to a `UpsProfile` entity.

---

### Requirement 2: Extended EditProfileModal — Tab Structure

**User Story:** As an admin or super_admin, I want the Edit Profile modal to present Identity Manager fields and UPS fields in separate tabs, so that the form remains navigable and does not become overwhelming.

#### Acceptance Criteria

1. THE `EditProfileModal` SHALL render two tabs: "Identity" (existing IM fields) and "Profile" (UPS fields).
2. WHEN the `EditProfileModal` opens, THE `Admin_Panel` SHALL display the "Identity" tab as the active tab by default.
3. WHEN the `Requesting_User` clicks the "Profile" tab, THE `Admin_Panel` SHALL display the UPS fields grouped into four sections: "Personal", "Contact", "Display", and "Preferences".
4. THE `EditProfileModal` SHALL maintain independent validation state for each tab and SHALL display tab-level error indicators when a tab contains validation errors.
5. WHEN the `Requesting_User` clicks "Save", THE `Admin_Panel` SHALL submit changed fields from both tabs in a single save operation, calling the IM update and each relevant UPS sub-endpoint only when their respective fields have changed.
6. THE `EditProfileModal` SHALL follow the same structural pattern as the existing modal (role="dialog", aria-modal="true", aria-labelledby, Cancel and Save buttons).

---

### Requirement 3: UPS Personal Fields

**User Story:** As an admin or super_admin, I want to edit a user's full name and date of birth, so that the UPS personal record stays accurate.

#### Acceptance Criteria

1. THE `EditProfileModal` "Personal" section SHALL render a `full_name` text input and a `date_of_birth` date input.
2. WHEN the `Requesting_User` submits with a `full_name` value that is empty or contains only whitespace, THE `Admin_Panel` SHALL display a field-level validation error and SHALL NOT submit the request.
3. WHEN the `Requesting_User` submits with a `date_of_birth` value that does not match the `YYYY-MM-DD` format, THE `Admin_Panel` SHALL display a field-level validation error and SHALL NOT submit the request.
4. WHEN `full_name` or `date_of_birth` differs from the pre-populated value, THE `HttpUserProfileClient` SHALL call `PATCH /api/v1/users/{user_id}/ups-profile/personal` with only the changed fields.
5. THE `UserProfileClient` port SHALL declare an `updatePersonal(userId: string, fields: UpsPersonalFields): Promise<void>` method where `UpsPersonalFields` is `{ fullName?: string; dateOfBirth?: string }`.

---

### Requirement 4: UPS Contact Fields

**User Story:** As an admin or super_admin, I want to edit a user's phone number and address, so that the UPS contact record stays accurate.

#### Acceptance Criteria

1. THE `EditProfileModal` "Contact" section SHALL render inputs for `phone`, `street`, `city`, `state`, `postal_code`, and `country`.
2. WHEN the `Requesting_User` submits with a `phone` value that contains characters other than digits, spaces, `+`, `-`, `(`, or `)`, THE `Admin_Panel` SHALL display a field-level validation error and SHALL NOT submit the request.
3. WHEN any contact field differs from the pre-populated value, THE `HttpUserProfileClient` SHALL call `PATCH /api/v1/users/{user_id}/ups-profile/contact` with only the changed contact fields.
4. THE `UserProfileClient` port SHALL declare an `updateContact(userId: string, fields: UpsContactFields): Promise<void>` method where `UpsContactFields` is `{ phone?: string; street?: string; city?: string; state?: string; postalCode?: string; country?: string }`.

---

### Requirement 5: UPS Display Fields

**User Story:** As an admin or super_admin, I want to edit a user's bio and UPS display name, so that the user's public profile presentation is correct.

#### Acceptance Criteria

1. THE `EditProfileModal` "Display" section SHALL render a `bio` textarea (max 500 characters) and a `display_name` text input for the UPS display name (distinct from the IM display name in the "Identity" tab).
2. WHEN the `Requesting_User` submits with a `bio` value that exceeds 500 characters, THE `Admin_Panel` SHALL display a field-level validation error and SHALL NOT submit the request.
3. THE `Admin_Panel` SHALL display a live character counter adjacent to the `bio` textarea showing remaining characters out of 500.
4. WHEN `bio` or UPS `display_name` differs from the pre-populated value, THE `HttpUserProfileClient` SHALL call `PATCH /api/v1/users/{user_id}/ups-profile/display` with only the changed display fields.
5. THE `UserProfileClient` port SHALL declare an `updateDisplay(userId: string, fields: UpsDisplayFields): Promise<void>` method where `UpsDisplayFields` is `{ bio?: string; displayName?: string }`.

---

### Requirement 6: UPS Preference Fields

**User Story:** As an admin or super_admin, I want to edit a user's notification preferences, language, and timezone, so that the user's communication and localization settings are correct.

#### Acceptance Criteria

1. THE `EditProfileModal` "Preferences" section SHALL render three checkboxes for `notification_preferences_email`, `notification_preferences_sms`, and `notification_preferences_whatsapp`; a `language` text input accepting ISO 639-1 codes; and a `timezone` text input accepting IANA timezone strings.
2. WHEN the `Requesting_User` submits with a `language` value that does not match the pattern `^[a-z]{2}$` (two lowercase letters), THE `Admin_Panel` SHALL display a field-level validation error and SHALL NOT submit the request.
3. WHEN the `Requesting_User` submits with a `timezone` value that is empty, THE `Admin_Panel` SHALL display a field-level validation error and SHALL NOT submit the request.
4. WHEN any preference field differs from the pre-populated value, THE `HttpUserProfileClient` SHALL call `PATCH /api/v1/users/{user_id}/ups-profile/preferences` with only the changed preference fields.
5. THE `UserProfileClient` port SHALL declare an `updatePreferences(userId: string, fields: UpsPreferenceFields): Promise<void>` method where `UpsPreferenceFields` is `{ notificationEmail?: boolean; notificationSms?: boolean; notificationWhatsapp?: boolean; language?: string; timezone?: string }`.

---

### Requirement 7: Frontend Diff-Only Submission

**User Story:** As an admin or super_admin, I want the modal to submit only the UPS sub-endpoints whose fields actually changed, so that unchanged sections do not generate unnecessary upstream writes.

#### Acceptance Criteria

1. WHEN the `Requesting_User` clicks "Save", THE `Admin_Panel` SHALL compare each UPS field against its pre-populated value and SHALL call only the sub-endpoints (`/personal`, `/contact`, `/display`, `/preferences`) for which at least one field has changed.
2. WHEN no UPS field has changed, THE `Admin_Panel` SHALL NOT call any UPS proxy endpoint.
3. WHEN the `Requesting_User` clicks "Save" and both IM fields and UPS fields have changed, THE `Admin_Panel` SHALL submit the IM update and all relevant UPS sub-endpoint calls concurrently.
4. IF any UPS sub-endpoint call returns HTTP 4xx or 5xx, THEN THE `Admin_Panel` SHALL display a dismissible error banner inside the `EditProfileModal` identifying which section failed and SHALL NOT close the modal.
5. WHEN all submitted calls succeed, THE `Admin_Panel` SHALL close the `EditProfileModal` and SHALL trigger a refresh of the affected user row consistent with the existing post-edit refresh behavior.

---

### Requirement 8: BFF UPS Proxy — Fetch Endpoint

**User Story:** As a developer, I want a `GET /api/v1/users/{user_id}/ups-profile` endpoint on the BFF, so that the frontend can retrieve the full UPS profile for a target user using the admin session.

#### Acceptance Criteria

1. THE `BFF` SHALL expose `GET /api/v1/users/{user_id}/ups-profile` that requires the `Requesting_User` to hold the `admin` or `super_admin` role; IF the role is absent, THEN THE `BFF` SHALL return HTTP 403.
2. WHEN the `Requesting_User` holds `admin` or `super_admin`, THE `BFF` SHALL call `GET /api/v1/profiles/{user_id}` on UPS forwarding the admin Bearer token via `UserProfileServiceAdapter`.
3. WHEN UPS returns HTTP 200, THE `BFF` SHALL return HTTP 200 with the UPS profile payload mapped to the BFF response schema.
4. WHEN UPS returns HTTP 404, THE `BFF` SHALL return HTTP 404 with a safe `user_message`.
5. IF UPS returns HTTP 5xx or a network error, THEN THE `BFF` SHALL return HTTP 502 with a safe `user_message` and SHALL log the failure with `user_id` and `duration_ms` without logging field values.
6. THE `BFF` SHALL derive the `Requesting_User`'s roles exclusively from the validated JWT claims.

---

### Requirement 9: BFF UPS Proxy — Mutation Endpoints

**User Story:** As a developer, I want BFF proxy endpoints for each UPS mutation sub-path, so that the frontend has role-gated, sanitized entry points for all UPS write operations.

#### Acceptance Criteria

1. THE `BFF` SHALL expose the following endpoints, each requiring `admin` or `super_admin` role (HTTP 403 otherwise):
   - `PATCH /api/v1/users/{user_id}/ups-profile/personal`
   - `PATCH /api/v1/users/{user_id}/ups-profile/contact`
   - `PATCH /api/v1/users/{user_id}/ups-profile/display`
   - `PATCH /api/v1/users/{user_id}/ups-profile/preferences`
2. WHEN the `BFF` receives a `PATCH /api/v1/users/{user_id}/ups-profile/personal` request, THE `BFF` SHALL validate `full_name` (non-empty after trim, max 200 characters) and `date_of_birth` (matches `YYYY-MM-DD` if provided) via Pydantic v2; IF validation fails, THEN THE `BFF` SHALL return HTTP 422 with field-level errors.
3. WHEN the `BFF` receives a `PATCH /api/v1/users/{user_id}/ups-profile/contact` request, THE `BFF` SHALL validate that all provided string fields are non-empty after trim; IF any provided field is blank after trim, THEN THE `BFF` SHALL return HTTP 422.
4. WHEN the `BFF` receives a `PATCH /api/v1/users/{user_id}/ups-profile/display` request, THE `BFF` SHALL validate that `bio` does not exceed 500 characters; IF it does, THEN THE `BFF` SHALL return HTTP 422.
5. WHEN the `BFF` receives a `PATCH /api/v1/users/{user_id}/ups-profile/preferences` request, THE `BFF` SHALL validate that `language` matches `^[a-z]{2}$` if provided and that `timezone` is a non-empty string if provided; IF validation fails, THEN THE `BFF` SHALL return HTTP 422.
6. WHEN validation passes, THE `BFF` SHALL forward the sanitized payload to the corresponding UPS endpoint via `UserProfileServiceAdapter` and SHALL return HTTP 204 on success.
7. IF UPS returns HTTP 4xx, THEN THE `BFF` SHALL propagate the status code and a safe `user_message` to the caller.
8. IF UPS returns HTTP 5xx or a network error, THEN THE `BFF` SHALL return HTTP 502 with a safe `user_message` and SHALL log the failure with `user_id`, `endpoint`, and `duration_ms`.

---

### Requirement 10: BFF Input Sanitization for UPS Fields

**User Story:** As a security engineer, I want all UPS string fields to be sanitized before forwarding to UPS, so that malicious input is neutralized at the BFF boundary.

#### Acceptance Criteria

1. WHEN the `BFF` receives `full_name`, `street`, `city`, `state`, `country`, or UPS `display_name` values, THE `BFF` SHALL apply `html.escape` to each trimmed string value before forwarding to `UserProfileServiceAdapter`.
2. WHEN the `BFF` receives a `bio` value, THE `BFF` SHALL apply `html.escape` to the trimmed value and SHALL enforce the 500-character limit on the escaped result.
3. THE `BFF` SHALL validate all UPS mutation request bodies via Pydantic v2 models before the request reaches the `UserManagementService`, consistent with the platform input validation standard.
4. THE `BFF` SHALL never log any UPS field values (names, addresses, bio text, phone numbers) at any log level; THE `BFF` SHALL log only `user_id`, `fields_updated` (list of field names), and `duration_ms`.

---

### Requirement 11: UserProfileServiceClient Port (BFF Domain Layer)

**User Story:** As a developer, I want a `UserProfileServiceClient` ABC in the BFF domain layer, so that the application service can call UPS without depending on the concrete HTTP adapter.

#### Acceptance Criteria

1. THE `UserProfileServiceClient` ABC SHALL declare the following `async` abstract methods:
   - `get_profile(user_id: str, *, token: str) -> dict[str, Any]`
   - `update_personal(user_id: str, fields: dict[str, str], *, token: str) -> None`
   - `update_contact(user_id: str, fields: dict[str, str], *, token: str) -> None`
   - `update_display(user_id: str, fields: dict[str, Any], *, token: str) -> None`
   - `update_preferences(user_id: str, fields: dict[str, Any], *, token: str) -> None`
2. THE `UserProfileServiceClient` ABC SHALL reside in `src/domain/repositories/user_profile_client.py` in the BFF, consistent with the platform port convention.
3. THE `UserProfileServiceClient` ABC methods SHALL NOT include any HTTP, httpx, or requests imports — the domain layer has zero infrastructure dependencies.

---

### Requirement 12: UserProfileServiceAdapter Concrete Implementation (BFF Infrastructure Layer)

**User Story:** As a developer, I want `UserProfileServiceAdapter` to implement `UserProfileServiceClient`, so that the BFF can reach the UPS endpoints with the admin Bearer token.

#### Acceptance Criteria

1. THE `UserProfileServiceAdapter` SHALL implement `get_profile` by calling `GET {ups_base_url}/api/v1/profiles/{user_id}` with the `token` as a Bearer header and SHALL return the parsed JSON response as a dict.
2. THE `UserProfileServiceAdapter` SHALL implement `update_personal`, `update_contact`, `update_display`, and `update_preferences` by calling the corresponding `PATCH {ups_base_url}/api/v1/profiles/{user_id}/{sub_path}` endpoints with the `token` as a Bearer header.
3. WHEN UPS returns HTTP 2xx for any method, THE `UserProfileServiceAdapter` SHALL return without error.
4. IF UPS returns HTTP 404 for `get_profile`, THEN THE `UserProfileServiceAdapter` SHALL raise `NotFoundError` with a safe `user_message`.
5. IF UPS returns HTTP 4xx (other than 404) for any method, THEN THE `UserProfileServiceAdapter` SHALL raise `ExternalServiceError` with the HTTP status code in the internal `message` and a safe `user_message`.
6. IF UPS returns HTTP 5xx or a network error for any method, THEN THE `UserProfileServiceAdapter` SHALL raise `ExternalServiceError` with a safe `user_message`.
7. THE `UserProfileServiceAdapter` SHALL wrap all UPS calls in the existing `CircuitBreaker` via `self._cb.call(...)`, consistent with the `IdentityManagerClient` pattern.
8. THE `UserProfileServiceAdapter` SHALL never log any field values — only `user_id`, `operation`, and `duration_ms`.

---

### Requirement 13: Role Enforcement for UPS Endpoints

**User Story:** As a security engineer, I want the BFF to enforce that only `admin` and `super_admin` roles can call UPS proxy endpoints, so that unprivileged users cannot modify other users' profiles.

#### Acceptance Criteria

1. THE `BFF` SHALL require the `Requesting_User` to hold the `admin` or `super_admin` role on all five UPS proxy endpoints (`GET` and four `PATCH`); IF neither role is present, THEN THE `BFF` SHALL return HTTP 403.
2. THE `BFF` SHALL derive the `Requesting_User`'s roles exclusively from the validated JWT claims, never from any client-supplied header or body field.
3. IF the `Requesting_User`'s JWT is absent or invalid on any UPS proxy endpoint, THEN THE `BFF` SHALL return HTTP 401 before reaching the UPS proxy logic.
4. THE `BFF` SHALL apply the same role enforcement to UPS proxy endpoints as it does to the existing IM profile endpoint, using the shared JWT validation dependency.

---

### Requirement 14: UPS Profile Round-Trip Consistency

**User Story:** As a developer, I want the BFF response schema for `GET /api/v1/users/{user_id}/ups-profile` to be the inverse of the mutation payloads, so that a fetch followed by an unmodified save produces no net change.

#### Acceptance Criteria

1. THE `BFF` `GET /api/v1/users/{user_id}/ups-profile` response SHALL include all fields editable via the four mutation endpoints: `full_name`, `date_of_birth`, `phone`, `street`, `city`, `state`, `postal_code`, `country`, `bio`, `display_name` (UPS), `notification_preferences_email`, `notification_preferences_sms`, `notification_preferences_whatsapp`, `language`, `timezone`.
2. FOR ALL valid `UpsProfile` objects, fetching then submitting all fields unchanged SHALL result in no net change to the UPS data (round-trip property).
3. THE `HttpUserProfileClient` `getProfile` response mapping SHALL produce a `UpsProfile` entity whose field names and types are the exact inverse of the fields accepted by `updatePersonal`, `updateContact`, `updateDisplay`, and `updatePreferences`.

---

### Requirement 15: Observability and Error Handling

**User Story:** As a developer, I want all UPS proxy operations to emit structured logs with duration and outcome, so that slow or failing UPS calls are visible in CloudWatch Logs Insights.

#### Acceptance Criteria

1. THE `BFF` `UserManagementService` SHALL log `ups_profile.fetch.started`, `ups_profile.fetch.completed`, and `ups_profile.fetch.failed` events with `user_id` and `duration_ms` for every `GET /api/v1/users/{user_id}/ups-profile` call.
2. THE `BFF` `UserManagementService` SHALL log `ups_profile.update.started`, `ups_profile.update.completed`, and `ups_profile.update.failed` events with `user_id`, `section` (e.g., `"personal"`, `"contact"`), and `duration_ms` for every mutation call.
3. THE `BFF` SHALL never log UPS field values (names, addresses, bio, phone, preferences) at any log level.
4. WHEN a UPS proxy call fails, THE `BFF` SHALL return a safe `user_message` to the client that does not expose UPS internal error details, stack traces, or field values.
5. THE `BFF` SHALL propagate the `X-Request-ID` correlation ID header to all upstream UPS calls via `UserProfileServiceAdapter`, consistent with the platform correlation ID standard.
