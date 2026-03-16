# Implementation Plan: admin-extended-profile-editor

## Overview

Extend the admin panel to support editing User Profile Service (UPS) fields alongside existing
Identity Manager fields. The modal gains a two-tab layout. New BFF proxy endpoints forward to UPS
with the admin Bearer token. Implementation follows TDD: tests are written before each unit.

## Tasks

- [x] 1. Create BFF domain port `UserProfileServiceClient`
  - Create `src/domain/repositories/user_profile_client.py` with `UserProfileServiceClient` ABC
  - Declare five `async` abstract methods: `get_profile`, `update_personal`, `update_contact`, `update_display`, `update_preferences`
  - No HTTP, httpx, or requests imports — pure domain port
  - _Requirements: 11.1, 11.2, 11.3_

- [x] 2. Implement `UserProfileServiceAdapter` (BFF infrastructure)
  - [x] 2.1 Write unit tests for `UserProfileServiceAdapter`
    - Create `tests/unit/infrastructure/test_user_profile_service_adapter.py`
    - Test `get_profile` calls `GET {base_url}/api/v1/profiles/{user_id}` with Bearer token
    - Test `NotFoundError` raised on 404 response
    - Test `ExternalServiceError` raised on 4xx non-404 response
    - Test `ExternalServiceError` raised on 5xx response
    - Test circuit breaker open raises `ExternalServiceError` without making HTTP call (Property 8)
    - Test `X-Request-ID` forwarded from `correlation_id_var` to UPS (Property 11)
    - Test each `update_personal`, `update_contact`, `update_display`, `update_preferences` calls the correct PATCH sub-path
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 15.5_

  - [x] 2.2 Implement `UserProfileServiceAdapter`
    - Create `src/infrastructure/adapters/user_profile_service_adapter.py`
    - Constructor: `circuit_breaker: CircuitBreaker`, `base_url: str`, `timeout: float = 10.0`
    - Wrap all calls via `self._cb.call(...)` — circuit breaker on every method
    - Read `correlation_id_var` and forward as `X-Request-ID` header on every outbound call
    - `get_profile`: `GET {base_url}/api/v1/profiles/{user_id}` → return parsed JSON dict
    - `update_personal/contact/display/preferences`: `PATCH {base_url}/api/v1/profiles/{user_id}/{sub_path}` → return None on 2xx
    - Raise `NotFoundError` on 404; `ExternalServiceError` on 4xx/5xx/network errors
    - Log `user_id`, `operation`, `duration_ms` — never field values
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 15.5_

- [x] 3. Extend `UserManagementService` with UPS methods
  - [x] 3.1 Write unit tests for `UserManagementService` UPS methods
    - Create `tests/unit/application/test_user_management_service_ups.py`
    - Mock `UserProfileServiceClient` with `AsyncMock(spec=UserProfileServiceClient)`
    - Test `get_ups_profile` delegates to `ups_client.get_profile` and returns result
    - Test `get_ups_profile` logs `ups_profile.fetch.started` and `ups_profile.fetch.completed` with `user_id` and `duration_ms`
    - Test `get_ups_profile` logs `ups_profile.fetch.failed` with `duration_ms` on error
    - Test each `update_ups_personal/contact/display/preferences` delegates to the corresponding `ups_client` method
    - Test each update method logs `ups_profile.update.started`, `ups_profile.update.completed`, `ups_profile.update.failed` with `user_id`, `section`, `duration_ms`
    - Test no field values appear in any log call (Requirements 10.4, 15.3)
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 3.2 Extend `UserManagementService`
    - Add `ups_client: UserProfileServiceClient` parameter to constructor in `src/application/services/user_management_service.py`
    - Implement `get_ups_profile(user_id, *, token)` — delegates to `ups_client.get_profile`
    - Implement `update_ups_personal(user_id, fields, *, token)` — delegates to `ups_client.update_personal`
    - Implement `update_ups_contact(user_id, fields, *, token)` — delegates to `ups_client.update_contact`
    - Implement `update_ups_display(user_id, fields, *, token)` — delegates to `ups_client.update_display`
    - Implement `update_ups_preferences(user_id, fields, *, token)` — delegates to `ups_client.update_preferences`
    - Each method logs started/completed/failed with `user_id`, `section`, `duration_ms` via structlog
    - _Requirements: 15.1, 15.2, 15.3_

- [x] 4. Add BFF Pydantic request/response models and UPS proxy endpoints
  - [x] 4.1 Write unit tests for UPS proxy endpoints
    - Create `tests/unit/presentation/test_ups_profile_endpoints.py`
    - Test HTTP 403 returned for non-admin/non-super_admin role on all five endpoints (Property 5)
    - Test HTTP 422 for blank `full_name` and `full_name` > 200 chars (Property 6)
    - Test HTTP 422 for `date_of_birth` not matching `YYYY-MM-DD` (Property 6)
    - Test HTTP 422 for blank contact fields when provided (Property 6)
    - Test HTTP 422 for `bio` > 500 characters (Property 6)
    - Test HTTP 422 for `language` not matching `^[a-z]{2}$` (Property 6)
    - Test HTTP 422 for blank `timezone` when provided (Requirements 9.5)
    - Test HTTP 204 on valid PATCH payload — service method called with sanitized fields (Requirements 9.6)
    - Test HTTP 200 on GET — service `get_ups_profile` called, response mapped to `UpsProfileResponse` (Requirements 8.3)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 13.1, 13.2, 13.3_

  - [x] 4.2 Add Pydantic models and UPS endpoints to `src/presentation/api/v1/users.py`
    - Add `UpsPersonalUpdateRequest` with `full_name` (trim, html.escape, max 200) and `date_of_birth` (YYYY-MM-DD regex) validators
    - Add `UpsContactUpdateRequest` with `phone`, `street`, `city`, `state`, `postal_code`, `country` (trim, html.escape, non-blank)
    - Add `UpsDisplayUpdateRequest` with `bio` (html.escape, max 500 on escaped result) and `display_name` (html.escape)
    - Add `UpsPreferencesUpdateRequest` with `notification_email/sms/whatsapp` booleans, `language` (`^[a-z]{2}$`), `timezone` (non-blank)
    - Add `UpsProfileResponse` with all 15 fields matching the GET response schema
    - Add `GET /{user_id}/ups-profile` → `UpsProfileResponse`, `require_roles(ADMIN, SUPER_ADMIN)`
    - Add `PATCH /{user_id}/ups-profile/personal` → 204, `require_roles(ADMIN, SUPER_ADMIN)`
    - Add `PATCH /{user_id}/ups-profile/contact` → 204, `require_roles(ADMIN, SUPER_ADMIN)`
    - Add `PATCH /{user_id}/ups-profile/display` → 204, `require_roles(ADMIN, SUPER_ADMIN)`
    - Add `PATCH /{user_id}/ups-profile/preferences` → 204, `require_roles(ADMIN, SUPER_ADMIN)`
    - All endpoints read token from `request.cookies.get("access_token", "")`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.2, 10.3, 13.1, 13.4_

- [x] 5. Wire `UserProfileServiceAdapter` in `src/main.py` lifespan
  - Instantiate `InMemoryCircuitBreaker` for UPS (service_name="user-profile-service")
  - Instantiate `UserProfileServiceAdapter` with circuit breaker and `settings.ups_base_url`
  - Pass `ups_client` to `UserManagementService` constructor
  - Add `ups_base_url: str` field to `src/config.py` Settings
  - _Requirements: 12.7_

- [x] 6. Checkpoint — BFF layer complete
  - Ensure all BFF unit tests pass: `uv run pytest tests/unit/ -v`
  - Ask the user if questions arise before proceeding to frontend.

- [x] 7. Create frontend `UpsProfile` entity and `UserProfileClient` port
  - Create `admin-shell/src/domain/entities/UpsProfile.ts` with the `UpsProfile` interface (15 fields)
  - Create `admin-shell/src/domain/repositories/UserProfileClient.ts` with `UserProfileClient` interface and field type interfaces: `UpsPersonalFields`, `UpsContactFields`, `UpsDisplayFields`, `UpsPreferenceFields`
  - _Requirements: 1.6, 3.5, 4.4, 5.5, 6.5, 14.3_

- [x] 8. Implement `HttpUserProfileClient` adapter
  - [x] 8.1 Write unit tests for `HttpUserProfileClient`
    - Create `admin-shell/src/infrastructure/adapters/HttpUserProfileClient.test.ts`
    - Mock `HttpClient`; test `getProfile` maps all 15 snake_case response fields to correct camelCase `UpsProfile` fields
    - Test `getProfile` on 404 throws a recognizable not-found error
    - Test `getProfile` on 5xx throws
    - Test `updatePersonal` sends correct snake_case body (`full_name`, `date_of_birth`)
    - Test `updateContact` sends correct snake_case body (`phone`, `street`, `city`, `state`, `postal_code`, `country`)
    - Test `updateDisplay` sends correct snake_case body (`bio`, `display_name`)
    - Test `updatePreferences` sends correct snake_case body (`notification_email`, `notification_sms`, `notification_whatsapp`, `language`, `timezone`)
    - _Requirements: 1.7, 3.4, 4.3, 5.4, 6.4, 14.3_

  - [x] 8.2 Implement `HttpUserProfileClient`
    - Create `admin-shell/src/infrastructure/adapters/HttpUserProfileClient.ts`
    - Implement `UserProfileClient` interface using existing `HttpClient` singleton
    - `getProfile`: `GET /api/v1/users/{userId}/ups-profile` → map snake_case response to `UpsProfile` (all 15 fields per mapping table)
    - On 404: throw a not-found error distinguishable from other errors
    - `updatePersonal`: `PATCH /api/v1/users/{userId}/ups-profile/personal` with snake_case body
    - `updateContact`: `PATCH /api/v1/users/{userId}/ups-profile/contact` with snake_case body
    - `updateDisplay`: `PATCH /api/v1/users/{userId}/ups-profile/display` with snake_case body
    - `updatePreferences`: `PATCH /api/v1/users/{userId}/ups-profile/preferences` with snake_case body
    - _Requirements: 1.7, 3.4, 4.3, 5.4, 6.4, 14.3_

  - [x]* 8.3 Write property test for `HttpUserProfileClient` field mapping
    - Create `admin-shell/src/infrastructure/adapters/HttpUserProfileClient.property.test.ts`
    - **Property 1: UPS profile pre-population maps all fields**
    - For any valid `UpsProfileResponse` shape (generated by fast-check), `getProfile` must produce a `UpsProfile` where every field matches the defined snake_case → camelCase mapping with no fields dropped or defaulted incorrectly
    - Minimum 100 iterations
    - **Validates: Requirements 1.3, 1.7, 14.3**

- [x] 9. Extend `EditProfileModal` with two-tab layout and UPS fields
  - [x] 9.1 Write unit tests for extended `EditProfileModal`
    - Create or extend `admin-shell/src/presentation/components/modals/EditProfileModal.test.tsx`
    - Test modal renders with "Identity" tab active by default (Requirements 2.2)
    - Test clicking "Profile" tab shows Personal, Contact, Display, Preferences sections (Requirements 2.3)
    - Test ARIA attributes: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (Requirements 2.6)
    - Test whitespace-only `full_name` shows field-level error and does not call any endpoint (Property 12)
    - Test `date_of_birth` not matching `YYYY-MM-DD` shows field-level error and does not call endpoint (Property 12)
    - Test `phone` with invalid characters shows field-level error and does not call contact endpoint (Property 13)
    - Test `bio` > 500 chars shows field-level error and does not call display endpoint (Property 14)
    - Test invalid `language` shows field-level error and does not call preferences endpoint (Property 15)
    - Test bio character counter updates on input (Property 14)
    - Test tab error indicators appear when tab contains validation errors (Property 16)
    - Test diff logic: only changed sections trigger `onSaveUps` calls (Property 2)
    - Test no calls made when nothing changed (Requirements 7.2)
    - Test `Promise.allSettled` partial failure: per-section error banners shown, modal stays open (Property 4)
    - Test all save calls succeed → modal closes and `onSuccess` called (Requirements 7.5)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.2, 3.3, 4.2, 5.2, 5.3, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 9.2 Extend `EditProfileModal` component
    - Extend `EditProfileModalProps` with `upsProfile: UpsProfile | null` and `onSaveUps` callback
    - Add `activeTab: 'identity' | 'profile'` state, defaulting to `'identity'`
    - Add UPS field state: `fullName`, `dateOfBirth`, `phone`, `street`, `city`, `state`, `postalCode`, `country`, `bio`, `upsDisplayName`, `notificationEmail`, `notificationSms`, `notificationWhatsapp`, `language`, `timezone`
    - Add per-section error banner state: `personalError`, `contactError`, `displayError`, `preferencesError`
    - Add tab-level error indicator state: `identityTabHasError`, `profileTabHasError`
    - Render two-tab layout: "Identity" (existing fields unchanged) and "Profile" (four UPS sections)
    - Profile tab sections: Personal (full_name, date_of_birth), Contact (phone, street, city, state, postal_code, country), Display (bio textarea with live counter, ups display_name), Preferences (three checkboxes, language, timezone)
    - Implement `computeUpsDiff` — returns only sections where at least one field differs from `upsProfile` initial values (or non-empty when `upsProfile` is null)
    - Save flow: build concurrent call list via `Promise.allSettled`; map rejections to per-section error banners; close modal only when all calls succeed
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x]* 9.3 Write property tests for `EditProfileModal`
    - Create `admin-shell/src/presentation/components/modals/EditProfileModal.property.test.tsx`
    - **Property 2: Diff-only section submission** — for any initial `UpsProfile` and any set of edits, `onSaveUps` is called exactly for sections with at least one changed field, no more, no less. Minimum 100 iterations.
    - **Validates: Requirements 3.4, 4.3, 5.4, 6.4, 7.1, 7.2**
    - **Property 14: Bio length validation and live counter** — for any bio string of length N (0–500), counter shows `500 - N`; for length > 500, field-level error shown and no endpoint called. Minimum 100 iterations.
    - **Validates: Requirements 5.2, 5.3**

- [x] 10. Extend `UsersPage` with UPS profile pre-population
  - [x] 10.1 Write unit tests for `UsersPage` UPS fetch behavior
    - Extend `admin-shell/src/presentation/pages/UsersPage.test.tsx` (or equivalent test file)
    - Test "Edit" button shows loading state while `getProfile` fetch is in progress (Requirements 1.2)
    - Test 404 from `getProfile` opens modal with `upsProfile = null` (Requirements 1.4)
    - Test 5xx from `getProfile` shows dismissible row-level error banner and does not open modal (Requirements 1.5)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 10.2 Extend `UsersPage` (or wherever `EditProfileModal` is opened)
    - Add `editLoadingUserId: string | null` state
    - Add `rowErrors: Record<string, string>` state for per-row error banners
    - On "Edit" click: set `editLoadingUserId`, call `httpUserProfileClient.getProfile(userId)`
    - On success: open modal with fetched `upsProfile`
    - On not-found error (404): open modal with `upsProfile = null`
    - On other error (5xx/network): set row-level error banner, do not open modal
    - Always clear `editLoadingUserId` in `finally`
    - Pass `upsProfile` and `onSaveUps` (delegating to `httpUserProfileClient`) to `EditProfileModal`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 11. Checkpoint — Frontend layer complete
  - Ensure all frontend unit tests pass: `npx vitest --run` inside `admin-shell/`
  - Ask the user if questions arise before proceeding to property-based tests.

- [ ] 12. BFF property-based tests (hypothesis)
  - [x]* 12.1 Write property test for HTML escaping of UPS string fields
    - Create or extend `tests/unit/presentation/test_ups_profile_endpoints_property.py`
    - **Property 7: HTML escaping of all UPS string fields**
    - Use `@given` with `st.text()` containing HTML special characters (`<`, `>`, `&`, `"`, `'`)
    - For any such string in `full_name`, `street`, `city`, `state`, `country`, `display_name`, the value forwarded to the service must have HTML entities applied via `html.escape`
    - Minimum 100 examples
    - **Validates: Requirements 10.1, 10.2**

  - [x]* 12.2 Write property test for Pydantic validation rejecting invalid payloads
    - **Property 6: BFF Pydantic validation rejects invalid UPS mutation payloads**
    - Use `@given` with `st.text(min_size=501)` for bio; `st.text()` filtered to non-`[a-z]{2}` for language; `st.just("")` for timezone
    - Assert `ValidationError` (or HTTP 422) is raised before reaching `UserManagementService`
    - Minimum 100 examples
    - **Validates: Requirements 9.2, 9.3, 9.4, 9.5**

  - [x]* 12.3 Write property test for UPS profile round-trip consistency
    - **Property 9: UPS profile round-trip consistency**
    - Use `@given` to generate valid `UpsProfileResponse`-shaped dicts
    - Assert the set of fields in the GET response schema equals the union of all four mutation request model fields
    - Minimum 100 examples
    - **Validates: Requirements 14.1, 14.2**

- [x] 13. Final checkpoint — Ensure all tests pass
  - Run BFF tests: `uv run pytest tests/unit/ -v --tb=short`
  - Run frontend tests: `npx vitest --run` inside `admin-shell/`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at layer boundaries
- Property tests validate universal correctness properties; unit tests validate specific examples and edge cases
- TDD order: write the test first (RED), implement the minimum to pass (GREEN), refactor
- The `UserProfileServiceClient` ABC (Task 1) must exist before the adapter (Task 2) and service (Task 3) can be implemented
- `computeUpsDiff` in `EditProfileModal` is the core of the diff-only submission guarantee (Property 2)
