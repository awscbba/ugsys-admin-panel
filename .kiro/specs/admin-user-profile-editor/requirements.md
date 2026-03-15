# Requirements Document

## Introduction

The Admin User Profile Editor adds an "Edit Profile" action to the Users table in the admin panel.
Currently, admins can change roles and activate/deactivate users, but cannot modify profile fields
(display name, email, password). This feature closes that gap by introducing a role-gated modal
dialog and the full backend stack needed to support it — from the BFF endpoint down to the
Identity Manager HTTP adapter.

Access is role-scoped:
- `super_admin` may edit `display_name`, `email`, and set a new password.
- `admin` may edit `display_name` only.

Role enforcement is applied server-side in the BFF regardless of what the client sends.

## Glossary

- **Admin_Panel**: The React + TypeScript single-page application served by the admin shell.
- **BFF**: The Python FastAPI backend-for-frontend (`ugsys-admin-panel` backend) that proxies requests to upstream services.
- **Identity_Manager**: The upstream `ugsys-identity-manager` service that owns user records.
- **IdentityClient**: The abstract port (ABC) in `src/domain/repositories/identity_client.py` that defines the contract for all Identity Manager calls.
- **IdentityManagerClient**: The concrete HTTP adapter in `src/infrastructure/adapters/identity_manager_client.py` that implements `IdentityClient`.
- **UserManagementService**: The application service in `src/application/services/user_management_service.py` that orchestrates user management operations.
- **UserManagementRepository**: The TypeScript port interface in the frontend domain layer (`src/domain/repositories/UserManagementRepository.ts`).
- **HttpUserManagementRepository**: The concrete TypeScript HTTP adapter (`src/infrastructure/repositories/HttpUserManagementRepository.ts`) that calls BFF endpoints.
- **EditProfileModal**: The React modal dialog component opened from a user row's "Edit" button.
- **ProfileUpdatePayload**: The set of fields `{ display_name?, email?, password? }` accepted by the BFF profile endpoint.
- **super_admin**: A platform role with full administrative privileges, including editing all profile fields.
- **admin**: A platform role with limited administrative privileges; may edit `display_name` only.
- **Requesting_User**: The authenticated admin or super_admin whose JWT is present in the session cookie.
- **Target_User**: The platform user whose profile is being edited.

---

## Requirements

### Requirement 1: Edit Button Visibility in the Users Table

**User Story:** As an admin or super_admin, I want an "Edit" button on each user row in the Users table, so that I can open the profile editor for that user.

#### Acceptance Criteria

1. THE `Admin_Panel` SHALL render an "Edit" button in the Actions column of every row in the Users table when the `Requesting_User` holds the `admin` or `super_admin` role.
2. WHEN the `Requesting_User` does not hold the `admin` or `super_admin` role, THE `Admin_Panel` SHALL not render the "Edit" button.
3. THE `Admin_Panel` SHALL derive the visibility of the "Edit" button from the RBAC context provided by `RbacProvider`, consistent with how the existing "Roles" and "Activate/Deactivate" buttons are gated.

---

### Requirement 2: Edit Profile Modal

**User Story:** As an admin or super_admin, I want a modal dialog to open when I click "Edit" on a user row, so that I can view and modify that user's editable profile fields.

#### Acceptance Criteria

1. WHEN the `Requesting_User` clicks the "Edit" button for a `Target_User`, THE `Admin_Panel` SHALL open the `EditProfileModal` pre-populated with the `Target_User`'s current `displayName` and `email` values from the `AdminUser` entity.
2. WHILE the `EditProfileModal` is open, THE `Admin_Panel` SHALL render a `display_name` text input field for all `Requesting_User` roles that have edit access (`admin`, `super_admin`).
3. WHERE the `Requesting_User` holds the `super_admin` role, THE `Admin_Panel` SHALL additionally render an `email` text input field and a `password` text input field in the `EditProfileModal`.
4. WHILE the `EditProfileModal` is open and the `Requesting_User` holds the `admin` role, THE `Admin_Panel` SHALL render the `email` field as read-only and SHALL NOT render the `password` field.
5. THE `EditProfileModal` SHALL follow the same structural pattern as the existing `RoleChangeModal` (role="dialog", aria-modal="true", aria-labelledby, Cancel and Save buttons).
6. WHEN the `Requesting_User` clicks "Cancel" or presses Escape, THE `Admin_Panel` SHALL close the `EditProfileModal` without submitting any changes.

---

### Requirement 3: Frontend Field Validation

**User Story:** As an admin or super_admin, I want the Edit Profile form to validate my input before submission, so that I receive immediate feedback on invalid values.

#### Acceptance Criteria

1. WHEN the `Requesting_User` submits the `EditProfileModal` with a `display_name` field that is empty or contains only whitespace, THE `Admin_Panel` SHALL display a field-level validation error and SHALL NOT submit the request.
2. WHERE the `Requesting_User` holds the `super_admin` role, WHEN the `Requesting_User` submits the `EditProfileModal` with an `email` field that does not match the RFC 5322 email format, THE `Admin_Panel` SHALL display a field-level validation error and SHALL NOT submit the request.
3. WHERE the `Requesting_User` holds the `super_admin` role, WHEN the `Requesting_User` submits the `EditProfileModal` with a `password` field that is non-empty and contains fewer than 8 characters, THE `Admin_Panel` SHALL display a field-level validation error and SHALL NOT submit the request.
4. WHEN the `Identity_Manager` returns a field-level error (e.g., "email already in use"), THE `Admin_Panel` SHALL display that error message adjacent to the relevant field inside the `EditProfileModal`.
5. IF the BFF returns an HTTP 422 response with a `detail` array, THEN THE `Admin_Panel` SHALL display each field error message in the `EditProfileModal` without closing the modal.

---

### Requirement 4: Frontend Profile Update Submission

**User Story:** As an admin or super_admin, I want the Edit Profile form to submit only the fields I changed, so that unmodified fields are not overwritten.

#### Acceptance Criteria

1. WHEN the `Requesting_User` clicks "Save" in the `EditProfileModal`, THE `HttpUserManagementRepository` SHALL call `PATCH /api/v1/users/{user_id}/profile` with a JSON body containing only the fields whose values differ from the pre-populated values.
2. WHEN the BFF returns HTTP 204, THE `Admin_Panel` SHALL close the `EditProfileModal` and SHALL refresh the affected user row in the Users table to reflect the updated values.
3. IF the BFF returns an HTTP 4xx or 5xx response that is not a field-level validation error, THEN THE `Admin_Panel` SHALL display a dismissible error banner inside the `EditProfileModal` and SHALL NOT close the modal.
4. WHILE a save operation is in progress, THE `Admin_Panel` SHALL disable the "Save" and "Cancel" buttons and SHALL display a loading indicator on the "Save" button.
5. THE `UserManagementRepository` port SHALL declare an `updateProfile(userId: string, fields: ProfileUpdateFields): Promise<void>` method, where `ProfileUpdateFields` is `{ displayName?: string; email?: string; password?: string }`.
6. THE `HttpUserManagementRepository` SHALL implement `updateProfile` by sending `PATCH /api/v1/users/{user_id}/profile` with the snake_case-mapped payload `{ display_name?, email?, password? }`.

---

### Requirement 5: BFF Profile Endpoint

**User Story:** As a developer, I want a `PATCH /api/v1/users/{user_id}/profile` endpoint on the BFF, so that the frontend has a single, role-aware entry point for profile updates.

#### Acceptance Criteria

1. THE `BFF` SHALL expose `PATCH /api/v1/users/{user_id}/profile` accepting a JSON body with optional fields `display_name` (string), `email` (string), and `password` (string).
2. THE `BFF` SHALL require the `Requesting_User` to hold the `admin` or `super_admin` role; IF the `Requesting_User` does not hold either role, THEN THE `BFF` SHALL return HTTP 403.
3. WHEN the `Requesting_User` holds the `admin` role, THE `BFF` SHALL silently discard any `email` or `password` fields present in the request body before forwarding to the `Identity_Manager`, regardless of what the client sent.
4. WHEN the `Requesting_User` holds the `super_admin` role, THE `BFF` SHALL forward all provided fields (`display_name`, `email`, `password`) to the `Identity_Manager`.
5. WHEN the request body contains an `email` field, THE `BFF` SHALL validate that the value conforms to RFC 5322 email format; IF the value is invalid, THEN THE `BFF` SHALL return HTTP 422 with a descriptive error before forwarding to the `Identity_Manager`.
6. WHEN the request body contains a `display_name` field, THE `BFF` SHALL sanitize the value using `html.escape` before forwarding to the `Identity_Manager`.
7. IF the `Identity_Manager` returns an error response for the profile update, THEN THE `BFF` SHALL propagate the HTTP status code and a safe error message to the caller without exposing internal details.
8. WHEN the profile update succeeds, THE `BFF` SHALL return HTTP 204 with no body.
9. THE `BFF` SHALL never include the `password` value in any log entry, structured log field, or error message at any log level.

---

### Requirement 6: BFF Password Change Forwarding

**User Story:** As a developer, I want the BFF to forward password changes to the Identity Manager's dedicated change-password endpoint, so that password updates follow the correct upstream API contract.

#### Acceptance Criteria

1. WHEN the `ProfileUpdatePayload` contains a `password` field and the `Requesting_User` holds the `super_admin` role, THE `UserManagementService` SHALL call `IdentityClient.change_password(user_id, new_password, token=token)` separately from the profile field update.
2. WHEN the `ProfileUpdatePayload` contains both profile fields (`display_name`, `email`) and a `password` field, THE `UserManagementService` SHALL call `IdentityClient.update_profile` for the profile fields and `IdentityClient.change_password` for the password, treating them as two sequential operations.
3. IF `IdentityClient.update_profile` succeeds but `IdentityClient.change_password` fails, THEN THE `UserManagementService` SHALL propagate the failure as an `ExternalServiceError` and SHALL log the failure with `user_id` and operation name, without logging the password value.
4. THE `BFF` SHALL never log the password value at any point in the call chain.

---

### Requirement 7: IdentityClient Port Extension

**User Story:** As a developer, I want the `IdentityClient` abstract port to declare `update_profile` and `change_password` methods, so that the application layer can call them without depending on the concrete HTTP adapter.

#### Acceptance Criteria

1. THE `IdentityClient` ABC SHALL declare an abstract method `update_profile(user_id: str, fields: dict[str, str], *, token: str) -> None` where `fields` contains only the keys `display_name` and/or `email`.
2. THE `IdentityClient` ABC SHALL declare an abstract method `change_password(user_id: str, new_password: str, *, token: str) -> None`.
3. THE `IdentityClient` ABC methods `update_profile` and `change_password` SHALL be `async`.
4. THE `IdentityClient` ABC SHALL NOT include `password` as a key in the `fields` parameter of `update_profile`; password changes are exclusively handled by `change_password`.

---

### Requirement 8: IdentityManagerClient Concrete Implementation

**User Story:** As a developer, I want `IdentityManagerClient` to implement `update_profile` and `change_password`, so that the BFF can reach the Identity Manager's existing profile and password endpoints.

#### Acceptance Criteria

1. THE `IdentityManagerClient` SHALL implement `update_profile` by calling `PATCH /api/v1/users/{user_id}` on the `Identity_Manager` with the provided `fields` dict as the JSON body, forwarding the `token` as a Bearer header.
2. THE `IdentityManagerClient` SHALL implement `change_password` by calling `POST /api/v1/users/{user_id}/change-password` on the `Identity_Manager` with `{ "new_password": new_password }` as the JSON body, forwarding the `token` as a Bearer header.
3. WHEN the `Identity_Manager` returns HTTP 2xx for `update_profile` or `change_password`, THE `IdentityManagerClient` SHALL return without error.
4. IF the `Identity_Manager` returns HTTP 4xx or 5xx for `update_profile` or `change_password`, THEN THE `IdentityManagerClient` SHALL raise `ExternalServiceError` with the HTTP status code in the internal `message` and a safe `user_message`.
5. THE `IdentityManagerClient` SHALL wrap both `update_profile` and `change_password` calls in the existing `CircuitBreaker` via `self._cb.call(...)`, consistent with all other adapter methods.
6. THE `IdentityManagerClient` SHALL never include the `new_password` value in any log entry or exception message.

---

### Requirement 9: Server-Side Role Enforcement

**User Story:** As a security engineer, I want the BFF to enforce role-based field access server-side, so that a non-super_admin cannot escalate privileges by crafting a direct API call.

#### Acceptance Criteria

1. THE `UserManagementService` SHALL accept a `requesting_user_roles` parameter in `update_profile` and SHALL strip `email` and `password` from the update payload when `super_admin` is not present in `requesting_user_roles`, regardless of what fields were passed by the caller.
2. WHEN a request arrives at `PATCH /api/v1/users/{user_id}/profile` with an `email` or `password` field and the `Requesting_User`'s JWT does not contain the `super_admin` role, THE `BFF` SHALL process the request as if those fields were absent (silent discard, not an error).
3. THE `BFF` SHALL derive the `Requesting_User`'s roles exclusively from the validated JWT claims, never from any client-supplied header or body field.
4. IF the `Requesting_User`'s JWT is absent or invalid, THEN THE `BFF` SHALL return HTTP 401 before reaching the profile update logic.

---

### Requirement 10: Input Sanitization and Validation

**User Story:** As a security engineer, I want all profile fields to be validated and sanitized before reaching the Identity Manager, so that malformed or malicious input is rejected at the BFF boundary.

#### Acceptance Criteria

1. WHEN the BFF receives a `display_name` value, THE `UserManagementService` SHALL apply `html.escape` to the trimmed value before passing it to `IdentityClient.update_profile`.
2. WHEN the BFF receives an `email` value, THE `BFF` SHALL validate it using Pydantic's `EmailStr` type in the request model; IF validation fails, THEN THE `BFF` SHALL return HTTP 422 with a field-level error message.
3. WHEN the BFF receives a `display_name` value that, after trimming, has a length of zero, THE `BFF` SHALL return HTTP 422 with a descriptive error message.
4. WHEN the BFF receives a `display_name` value that exceeds 100 characters after trimming, THE `BFF` SHALL return HTTP 422 with a descriptive error message.
5. THE `BFF` SHALL validate all inputs via Pydantic v2 request models before the request reaches the `UserManagementService`, consistent with the platform input validation standard.

---

### Requirement 11: Sensitive Data Handling

**User Story:** As a security engineer, I want passwords to be excluded from all logs and error messages throughout the call chain, so that credentials are never exposed in observability tooling.

#### Acceptance Criteria

1. THE `BFF` SHALL never log the `password` field value at any log level in any component (`users.py` router, `UserManagementService`, `IdentityManagerClient`).
2. THE `BFF` SHALL never include the `password` field value in any exception `message`, `user_message`, or `additional_data` field of any `DomainError` subclass.
3. THE `BFF` SHALL never include the `password` field value in any HTTP response body returned to the client.
4. WHEN `UserManagementService` logs the `update_profile.started` or `update_profile.completed` events, THE `UserManagementService` SHALL log only `user_id`, `fields_updated` (a list of field names, not values), and `duration_ms` — never field values.

---

### Requirement 12: Post-Edit Table Refresh

**User Story:** As an admin or super_admin, I want the user row to reflect updated values immediately after a successful edit, so that I can confirm the change without manually refreshing the page.

#### Acceptance Criteria

1. WHEN `HttpUserManagementRepository.updateProfile` resolves successfully, THE `Admin_Panel` SHALL re-fetch the current page of the Users table using the existing `fetchUsers` mechanism.
2. THE `Admin_Panel` SHALL update the `displayName` and `email` columns of the affected row to reflect the values returned by the subsequent `listUsers` call.
3. WHEN the table refresh is in progress after a successful edit, THE `Admin_Panel` SHALL display the existing shimmer loading indicator consistent with other post-action refreshes (role change, status toggle).
```
