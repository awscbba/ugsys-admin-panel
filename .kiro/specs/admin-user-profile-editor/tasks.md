# Implementation Tasks

## Tasks

- [x] 1. Extend IdentityClient port and IdentityManagerClient adapter
  - [x] 1.1 Add abstract async methods `update_profile` and `change_password` to `src/domain/repositories/identity_client.py`
  - [x] 1.2 Implement both methods in `src/infrastructure/adapters/identity_manager_client.py` using `self._cb.call(...)` and forwarding the Bearer token; never log `new_password`
  - [x] 1.3 Write unit tests in `tests/unit/infrastructure/test_identity_manager_client.py` covering happy path, 4xx/5xx → `ExternalServiceError`, and circuit-breaker delegation for both methods

- [x] 2. Implement UserManagementService.update_profile method
  - [x] 2.1 Add `update_profile(user_id, display_name, email, password, requesting_user_roles, token)` to `src/application/services/user_management_service.py`; strip `email` and `password` when `super_admin` not in `requesting_user_roles` (silent discard)
  - [x] 2.2 Call `IdentityClient.update_profile` for profile fields and `IdentityClient.change_password` for password as sequential operations; propagate failure as `ExternalServiceError`
  - [x] 2.3 Log `update_profile.started` and `update_profile.completed` with `user_id`, `fields_updated` (names only), and `duration_ms`; never log password value
  - [x] 2.4 Write unit tests in `tests/unit/application/test_user_management_update_profile.py` covering: display_name only (admin role), all fields (super_admin role), email/password stripped for admin role, identity client failure propagation, password-never-logged property

- [x] 3. Add PATCH /api/v1/users/{user_id}/profile BFF endpoint
  - [x] 3.1 Add `ProfileUpdateRequest` Pydantic model with `display_name`, `email` (EmailStr), and `password` validators to `src/presentation/api/v1/users.py`
  - [x] 3.2 Add `PATCH /{user_id}/profile` route handler requiring `admin` or `super_admin` role; derive roles from `request.state.user_roles`; delegate to `UserManagementService.update_profile`; return 204
  - [x] 3.3 Write endpoint tests in `tests/unit/presentation/test_users_profile_patch.py` covering: 204 success (admin), 204 success (super_admin with all fields), 422 blank display_name, 422 invalid email, 422 password < 8 chars, 403 missing role, 401 missing JWT, 502 identity client failure

- [x] 4. Extend UserManagementRepository port and HttpUserManagementRepository adapter (frontend)
  - [x] 4.1 Add `ProfileUpdateFields` type and `updateProfile(userId, fields)` method to `admin-shell/src/domain/repositories/UserManagementRepository.ts`
  - [x] 4.2 Implement `updateProfile` in `admin-shell/src/infrastructure/repositories/HttpUserManagementRepository.ts` mapping camelCase → snake_case and calling `PATCH /api/v1/users/{userId}/profile`

- [x] 5. Build EditProfileModal component
  - [x] 5.1 Create `admin-shell/src/presentation/components/modals/EditProfileModal.tsx` with `display_name` (pre-populated, always editable), `email` (pre-populated, read-only for `admin`, editable for `super_admin`), and `password` (empty, hidden for `admin`, shown for `super_admin`); `role="dialog"`, `aria-modal="true"`, `aria-labelledby`; Cancel/Save buttons disabled while saving
  - [x] 5.2 Implement client-side validation: blank/whitespace display_name, invalid email format (super_admin only), password < 8 chars (super_admin only); show field-level errors, do not submit
  - [x] 5.3 On save: build diff payload (only changed fields), call `updateProfile`, call `onSuccess` + close modal on 204, show dismissible error banner on failure
  - [x] 5.4 Write unit tests in `EditProfileModal.test.tsx` covering: pre-population, field visibility by role, all validation rules, diff-only submission, 204 closes modal and calls onSuccess, error banner on failure, buttons disabled while saving

- [x] 6. Wire Edit button and EditProfileModal into UserManagement.tsx
  - [x] 6.1 Add "Edit" button to the Actions column of each user row in `admin-shell/src/presentation/components/pages/UserManagement.tsx`, gated by `hasRole("admin") || hasRole("super_admin")` from `RbacProvider`
  - [x] 6.2 Manage `editingUser` state; render `EditProfileModal` when set; on `onSuccess` call `fetchUsers` to refresh the table
