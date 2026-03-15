# Implementation Tasks

## Tasks

- [x] 1. Extend IdentityClient port and IdentityManagerClient adapter
  - [x] 1.1 Add abstract async methods `update_own_profile` and `change_own_password` to `src/domain/repositories/identity_client.py`
  - [x] 1.2 Implement both methods in `src/infrastructure/adapters/identity_manager_client.py` using `self._cb.call(...)` and forwarding the Bearer token; never log `new_password`
  - [x] 1.3 Write unit tests in `tests/unit/infrastructure/test_identity_manager_client.py` covering happy path, 4xx/5xx → `ExternalServiceError`, and circuit-breaker delegation

- [x] 2. Implement SelfProfileService application service
  - [x] 2.1 Create `src/application/services/self_profile_service.py` with `update_own_profile(user_id, display_name, password, token)` orchestrating sequential calls to `IdentityClient`
  - [x] 2.2 Log `update_own_profile.started` and `update_own_profile.completed` with `user_id`, `fields_updated` (names only), and `duration_ms`; never log password value
  - [x] 2.3 Write unit tests in `tests/unit/application/test_self_profile_service.py` covering: display_name only, password only, both fields, identity client failure propagation, and password-never-logged property

- [x] 3. Add PATCH /api/v1/auth/me BFF endpoint
  - [x] 3.1 Add `SelfProfileUpdateRequest` Pydantic model with `display_name` and `password` validators (html.escape, length, min-length) to `src/presentation/api/v1/auth.py`
  - [x] 3.2 Add `PATCH /me` route handler that derives `user_id` from `request.state.user_id` (JWT sub) and delegates to `SelfProfileService`; return 204
  - [x] 3.3 Wire `SelfProfileService` dependency in `src/main.py` lifespan
  - [x] 3.4 Write endpoint tests in `tests/unit/presentation/test_auth_me_patch.py` covering: 204 success, 422 blank display_name, 422 display_name > 100 chars, 422 password < 8 chars, 401 missing JWT, 502 identity client failure

- [x] 4. Extend AuthRepository port and HttpAuthRepository adapter (frontend)
  - [x] 4.1 Add `SelfProfileUpdateFields` type and `updateOwnProfile(fields)` method to `admin-shell/src/domain/repositories/AuthRepository.ts`
  - [x] 4.2 Implement `updateOwnProfile` in `admin-shell/src/infrastructure/repositories/HttpAuthRepository.ts` mapping camelCase → snake_case and calling `PATCH /api/v1/auth/me`

- [x] 5. Add updateOwnProfile action to authStore
  - [x] 5.1 Add `updateOwnProfile(fields: SelfProfileUpdateFields): Promise<void>` to `admin-shell/src/stores/authStore.ts`; set `$isLoading`, call repository, merge `displayName` into `$user` atom on success, set `$error` and re-throw on failure, always reset `$isLoading` in finally

- [x] 6. Build ProfileDropdown component
  - [x] 6.1 Create `admin-shell/src/presentation/components/layout/ProfileDropdown.tsx` with `role="menu"`, two `role="menuitem"` entries ("Edit Profile", "Logout"), click-outside dismissal, Escape key dismissal with focus return, and Up/Down Arrow key navigation
  - [x] 6.2 Write unit tests in `ProfileDropdown.test.tsx` covering: renders two items, click-outside closes, Escape closes and returns focus, arrow key navigation cycles items, Edit Profile callback fires, Logout callback fires

- [x] 7. Build SelfEditProfileModal component
  - [x] 7.1 Create `admin-shell/src/presentation/components/modals/SelfEditProfileModal.tsx` with `display_name` (pre-populated), `new_password`, and `confirm_password` fields; `role="dialog"`, `aria-modal="true"`, `aria-labelledby`; Cancel/Save buttons disabled while saving; loading indicator on Save
  - [x] 7.2 Implement client-side validation: blank/whitespace display_name, display_name > 100 chars, password < 8 chars, password ≠ confirm_password — show field-level errors, do not submit
  - [x] 7.3 On save: build diff payload (only changed fields), call `updateOwnProfile`, close modal on 204, show dismissible error banner on failure
  - [x] 7.4 Write unit tests in `SelfEditProfileModal.test.tsx` covering: pre-population, all validation rules, diff-only submission (unchanged displayName not sent), 204 closes modal, error banner on failure, buttons disabled while saving

- [x] 8. Refactor TopBar to use ProfileDropdown and SelfEditProfileModal
  - [x] 8.1 Update `admin-shell/src/presentation/components/layout/TopBar.tsx`: replace standalone logout button with avatar/name trigger (`role="button"`, `aria-haspopup="true"`, `aria-expanded`), manage `dropdownOpen` and `editModalOpen` state, render `ProfileDropdown` and `SelfEditProfileModal` conditionally
  - [x] 8.2 Compute initials from `displayName` (or `email` fallback) for the avatar placeholder; render `<img>` when `user.avatar` is set
