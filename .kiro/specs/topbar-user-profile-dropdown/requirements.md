# Requirements Document

## Introduction

The TopBar User Profile Dropdown replaces the static user info and logout button in the admin
panel's `TopBar` with a clickable dropdown menu. Clicking the avatar or display name opens a
menu with two items: "Edit Profile" and "Logout". "Edit Profile" opens a modal that lets the
currently authenticated user update their own display name and password — self-service, not
admin-on-other-user editing.

This feature is distinct from `admin-user-profile-editor`, which lets admins edit other users'
profiles via the Users table. Here, the subject is always the logged-in user themselves, and
no elevated role is required beyond being authenticated. The `user_id` is always derived
server-side from the JWT `sub` claim — never from the client.

## Glossary

- **Admin_Panel**: The React + TypeScript single-page application served by the admin shell.
- **BFF**: The Python FastAPI backend-for-frontend (`ugsys-admin-panel` backend) that proxies requests to upstream services.
- **Identity_Manager**: The upstream `ugsys-identity-manager` service that owns user records.
- **IdentityClient**: The abstract port (ABC) in `src/domain/repositories/identity_client.py` that defines the contract for all Identity Manager calls.
- **IdentityManagerClient**: The concrete HTTP adapter in `src/infrastructure/adapters/identity_manager_client.py` that implements `IdentityClient`.
- **TopBar**: The React component (`TopBar.tsx`) rendered at the top of the authenticated layout, currently showing the user's display name, avatar, and a logout button.
- **ProfileDropdown**: The dropdown menu component rendered inside `TopBar` when the user clicks the avatar/name trigger area.
- **SelfEditProfileModal**: The React modal dialog opened from the "Edit Profile" item in the `ProfileDropdown`, used to edit the logged-in user's own display name and password.
- **AuthStore**: The nanostores state module (`authStore.ts`) holding the `$user` atom and auth actions.
- **HttpAuthRepository**: The TypeScript HTTP adapter that calls BFF auth endpoints.
- **SelfProfileUpdateFields**: The set of optional fields `{ displayName?, password? }` accepted by the self-profile update flow.
- **Authenticated_User**: The currently logged-in admin whose JWT is present in the session cookie. The subject of all self-profile operations.
- **JWT_Sub**: The `sub` claim in the authenticated user's JWT, used server-side to identify the user being updated. Never supplied by the client.

---

## Requirements

### Requirement 1: TopBar Dropdown Trigger

**User Story:** As an authenticated admin, I want to click my avatar or display name in the TopBar to open a dropdown menu, so that I can access profile and session actions from a single place.

#### Acceptance Criteria

1. THE `TopBar` SHALL render the avatar and display name as a single interactive trigger element with `role="button"` and `aria-haspopup="true"`.
2. WHEN the `Authenticated_User` clicks the trigger element, THE `TopBar` SHALL open the `ProfileDropdown` and set `aria-expanded="true"` on the trigger.
3. WHEN the `ProfileDropdown` is open and the `Authenticated_User` clicks outside the dropdown, THE `TopBar` SHALL close the `ProfileDropdown` and set `aria-expanded="false"` on the trigger.
4. WHEN the `ProfileDropdown` is open and the `Authenticated_User` presses the Escape key, THE `TopBar` SHALL close the `ProfileDropdown` and return focus to the trigger element.
5. THE `TopBar` SHALL remove the standalone "Logout" button that currently exists and replace it with the `ProfileDropdown` trigger.

---

### Requirement 2: ProfileDropdown Menu Items

**User Story:** As an authenticated admin, I want the dropdown to show "Edit Profile" and "Logout" options, so that I can navigate to profile editing or end my session.

#### Acceptance Criteria

1. THE `ProfileDropdown` SHALL render exactly two menu items: "Edit Profile" and "Logout", in that order.
2. THE `ProfileDropdown` SHALL use `role="menu"` on the container and `role="menuitem"` on each item, consistent with ARIA menu patterns.
3. WHEN the `Authenticated_User` clicks "Edit Profile", THE `ProfileDropdown` SHALL close and THE `Admin_Panel` SHALL open the `SelfEditProfileModal`.
4. WHEN the `Authenticated_User` clicks "Logout", THE `ProfileDropdown` SHALL invoke the existing `logout` action from `AuthStore`, identical in behavior to the current logout button.
5. THE `ProfileDropdown` SHALL be keyboard-navigable: the Down Arrow key SHALL move focus to the first menu item when the dropdown opens, and the Up/Down Arrow keys SHALL cycle focus between menu items.

---

### Requirement 3: SelfEditProfileModal Layout and Fields

**User Story:** As an authenticated admin, I want a modal to edit my own display name and optionally set a new password, so that I can keep my profile up to date without leaving the admin panel.

#### Acceptance Criteria

1. THE `SelfEditProfileModal` SHALL render a `display_name` text input pre-populated with the `Authenticated_User`'s current `displayName` from the `$user` atom.
2. THE `SelfEditProfileModal` SHALL render a `new_password` text input of type `password` that is empty by default; leaving it blank SHALL indicate no password change is requested.
3. THE `SelfEditProfileModal` SHALL render a `confirm_password` text input of type `password` that is empty by default.
4. THE `SelfEditProfileModal` SHALL follow the same structural pattern as the existing `RoleChangeModal` and `EditProfileModal` (role="dialog", aria-modal="true", aria-labelledby, "Save" and "Cancel" buttons).
5. WHEN the `Authenticated_User` clicks "Cancel" or presses Escape, THE `SelfEditProfileModal` SHALL close without submitting any changes.
6. WHILE a save operation is in progress, THE `SelfEditProfileModal` SHALL disable the "Save" and "Cancel" buttons and SHALL display a loading indicator on the "Save" button.

---

### Requirement 4: Frontend Field Validation

**User Story:** As an authenticated admin, I want the Edit Profile form to validate my input before submission, so that I receive immediate feedback on invalid values.

#### Acceptance Criteria

1. WHEN the `Authenticated_User` submits the `SelfEditProfileModal` with a `display_name` field that is empty or contains only whitespace, THE `Admin_Panel` SHALL display a field-level validation error and SHALL NOT submit the request.
2. WHEN the `Authenticated_User` submits the `SelfEditProfileModal` with a `display_name` field that exceeds 100 characters after trimming, THE `Admin_Panel` SHALL display a field-level validation error and SHALL NOT submit the request.
3. WHEN the `Authenticated_User` submits the `SelfEditProfileModal` with a non-empty `new_password` field that contains fewer than 8 characters, THE `Admin_Panel` SHALL display a field-level validation error and SHALL NOT submit the request.
4. WHEN the `Authenticated_User` submits the `SelfEditProfileModal` with a non-empty `new_password` field and a `confirm_password` value that does not match `new_password`, THE `Admin_Panel` SHALL display a field-level validation error on the `confirm_password` field and SHALL NOT submit the request.
5. IF the BFF returns HTTP 422 with a `detail` array, THEN THE `Admin_Panel` SHALL display each field error message inside the `SelfEditProfileModal` without closing the modal.
6. IF the BFF returns an HTTP 4xx or 5xx response that is not a field-level validation error, THEN THE `Admin_Panel` SHALL display a dismissible error banner inside the `SelfEditProfileModal` and SHALL NOT close the modal.

---

### Requirement 5: Frontend Self-Profile Update Submission

**User Story:** As an authenticated admin, I want the form to submit only the fields I changed, so that unmodified fields are not overwritten.

#### Acceptance Criteria

1. WHEN the `Authenticated_User` clicks "Save" in the `SelfEditProfileModal`, THE `HttpAuthRepository` SHALL call `PATCH /api/v1/auth/me` with a JSON body containing only the fields that differ from the current values: `display_name` if changed, `password` if `new_password` is non-empty.
2. WHEN the BFF returns HTTP 204, THE `SelfEditProfileModal` SHALL close and THE `AuthStore` SHALL update the `$user` atom's `displayName` field to reflect the new value, so that the `TopBar` immediately displays the updated name without a page reload.
3. THE `AuthStore` SHALL expose an `updateOwnProfile(fields: SelfProfileUpdateFields): Promise<void>` action that calls `HttpAuthRepository.updateOwnProfile` and, on success, merges the returned or submitted `displayName` into the `$user` atom.
4. THE `HttpAuthRepository` SHALL implement `updateOwnProfile` by sending `PATCH /api/v1/auth/me` with the snake_case-mapped payload `{ display_name?, password? }`.

---

### Requirement 6: BFF Self-Profile Endpoint

**User Story:** As a developer, I want a `PATCH /api/v1/auth/me` endpoint on the BFF, so that the frontend has a dedicated, authenticated entry point for self-profile updates.

#### Acceptance Criteria

1. THE `BFF` SHALL expose `PATCH /api/v1/auth/me` accepting a JSON body with optional fields `display_name` (string) and `password` (string).
2. THE `BFF` SHALL require a valid session; IF the request does not carry a valid session cookie, THEN THE `BFF` SHALL return HTTP 401 before reaching the update logic.
3. THE `BFF` SHALL derive the `user_id` exclusively from the `sub` claim of the validated JWT; THE `BFF` SHALL never accept a `user_id` from the request body, query string, or any client-supplied header.
4. WHEN the request body contains a `display_name` field, THE `BFF` SHALL sanitize the value using `html.escape` on the trimmed value before forwarding to the `Identity_Manager`.
5. WHEN the request body contains a `display_name` value that, after trimming, has a length of zero, THE `BFF` SHALL return HTTP 422 with a descriptive error message.
6. WHEN the request body contains a `display_name` value that exceeds 100 characters after trimming, THE `BFF` SHALL return HTTP 422 with a descriptive error message.
7. WHEN the request body contains a `password` field with fewer than 8 characters, THE `BFF` SHALL return HTTP 422 with a descriptive error message without forwarding to the `Identity_Manager`.
8. WHEN the profile update succeeds, THE `BFF` SHALL return HTTP 204 with no body.
9. IF the `Identity_Manager` returns an error response, THEN THE `BFF` SHALL propagate the HTTP status code and a safe error message to the caller without exposing internal details.
10. THE `BFF` SHALL never include the `password` value in any log entry, structured log field, or error message at any log level.

---

### Requirement 7: BFF Password Change Forwarding

**User Story:** As a developer, I want the BFF to forward self-service password changes to the Identity Manager's dedicated change-password endpoint, so that password updates follow the correct upstream API contract.

#### Acceptance Criteria

1. WHEN the `PATCH /api/v1/auth/me` request body contains a `password` field, THE `BFF` SHALL call `IdentityClient.change_own_password(user_id, new_password, token=token)` using the `user_id` derived from the JWT `sub` claim.
2. WHEN the request body contains both a `display_name` field and a `password` field, THE `BFF` SHALL call `IdentityClient.update_own_profile` for the `display_name` and `IdentityClient.change_own_password` for the password as two sequential operations.
3. IF `IdentityClient.update_own_profile` succeeds but `IdentityClient.change_own_password` fails, THEN THE `BFF` SHALL propagate the failure as an `ExternalServiceError` and SHALL log the failure with `user_id` and operation name, without logging the password value.
4. THE `BFF` SHALL never log the password value at any point in the call chain.

---

### Requirement 8: IdentityClient Port Extension

**User Story:** As a developer, I want the `IdentityClient` abstract port to declare `update_own_profile` and `change_own_password` methods, so that the application layer can call them without depending on the concrete HTTP adapter.

#### Acceptance Criteria

1. THE `IdentityClient` ABC SHALL declare an abstract async method `update_own_profile(user_id: str, fields: dict[str, str], *, token: str) -> None` where `fields` contains only the key `display_name`.
2. THE `IdentityClient` ABC SHALL declare an abstract async method `change_own_password(user_id: str, new_password: str, *, token: str) -> None`.
3. THE `IdentityClient` ABC SHALL NOT include `password` as a key in the `fields` parameter of `update_own_profile`; password changes are exclusively handled by `change_own_password`.
4. THE `IdentityClient` ABC methods `update_own_profile` and `change_own_password` SHALL be distinct from the existing `update_profile` and `change_password` methods defined for the `admin-user-profile-editor` feature, to preserve the separation between self-service and admin-on-other-user operations.

---

### Requirement 9: IdentityManagerClient Concrete Implementation

**User Story:** As a developer, I want `IdentityManagerClient` to implement `update_own_profile` and `change_own_password`, so that the BFF can reach the Identity Manager's existing profile and password endpoints for self-service updates.

#### Acceptance Criteria

1. THE `IdentityManagerClient` SHALL implement `update_own_profile` by calling `PATCH /api/v1/users/{user_id}` on the `Identity_Manager` with the provided `fields` dict as the JSON body, forwarding the `token` as a Bearer header.
2. THE `IdentityManagerClient` SHALL implement `change_own_password` by calling `POST /api/v1/users/{user_id}/change-password` on the `Identity_Manager` with `{ "new_password": new_password }` as the JSON body, forwarding the `token` as a Bearer header.
3. WHEN the `Identity_Manager` returns HTTP 2xx for `update_own_profile` or `change_own_password`, THE `IdentityManagerClient` SHALL return without error.
4. IF the `Identity_Manager` returns HTTP 4xx or 5xx for `update_own_profile` or `change_own_password`, THEN THE `IdentityManagerClient` SHALL raise `ExternalServiceError` with the HTTP status code in the internal `message` and a safe `user_message`.
5. THE `IdentityManagerClient` SHALL wrap both `update_own_profile` and `change_own_password` calls in the existing `CircuitBreaker` via `self._cb.call(...)`, consistent with all other adapter methods.
6. THE `IdentityManagerClient` SHALL never include the `new_password` value in any log entry or exception message.

---

### Requirement 10: AuthStore Update After Successful Save

**User Story:** As an authenticated admin, I want my display name in the TopBar to update immediately after I save a profile change, so that I can confirm the change without reloading the page.

#### Acceptance Criteria

1. WHEN `AuthStore.updateOwnProfile` resolves successfully and the submitted payload included a `displayName` value, THE `AuthStore` SHALL update the `$user` atom by merging the new `displayName` into the existing `AdminUser` object.
2. THE `TopBar` SHALL reactively re-render the display name and avatar initials from the updated `$user` atom without requiring a page reload.
3. WHEN `AuthStore.updateOwnProfile` fails, THE `AuthStore` SHALL leave the `$user` atom unchanged and SHALL set the `$error` atom to a safe error message.
4. THE `AuthStore` SHALL set `$isLoading` to `true` for the duration of the `updateOwnProfile` call and SHALL set it back to `false` in a `finally` block regardless of outcome.

---

### Requirement 11: Server-Side Identity Enforcement

**User Story:** As a security engineer, I want the BFF to always derive the target user's identity from the JWT, so that a user cannot update another user's profile by crafting a direct API call.

#### Acceptance Criteria

1. THE `BFF` SHALL derive the `user_id` for `PATCH /api/v1/auth/me` exclusively from the `sub` claim of the validated JWT, never from any client-supplied value.
2. IF the `Authenticated_User`'s JWT is absent, expired, or invalid, THEN THE `BFF` SHALL return HTTP 401 before reaching the self-profile update logic.
3. THE `BFF` SHALL apply no role restriction beyond requiring a valid authenticated session for `PATCH /api/v1/auth/me`; any authenticated admin role (`admin`, `super_admin`) SHALL be permitted to call this endpoint.
4. THE `BFF` SHALL log the `user_id` (from JWT `sub`) and the list of field names being updated (not their values) at the `info` level for every call to `PATCH /api/v1/auth/me`.

---

### Requirement 12: Sensitive Data Handling

**User Story:** As a security engineer, I want passwords to be excluded from all logs and error messages throughout the call chain, so that credentials are never exposed in observability tooling.

#### Acceptance Criteria

1. THE `BFF` SHALL never log the `password` field value at any log level in any component (`auth.py` router, application service, `IdentityManagerClient`).
2. THE `BFF` SHALL never include the `password` field value in any exception `message`, `user_message`, or `additional_data` field of any `DomainError` subclass.
3. THE `BFF` SHALL never include the `password` field value in any HTTP response body returned to the client.
4. WHEN the application service logs the `update_own_profile.started` or `update_own_profile.completed` events, THE service SHALL log only `user_id`, `fields_updated` (a list of field names, not values), and `duration_ms`.
