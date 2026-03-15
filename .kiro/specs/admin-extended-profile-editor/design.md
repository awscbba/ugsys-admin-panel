# Design Document — admin-extended-profile-editor

## Overview

This feature extends the existing `EditProfileModal` to support editing User Profile Service (UPS)
fields alongside the existing Identity Manager (IM) fields. The modal gains a two-tab layout:
"Identity" (existing IM fields unchanged) and "Profile" (new UPS fields).

The extension adds:
- A new `UserProfileClient` TypeScript port and `HttpUserProfileClient` adapter in the frontend
- A new `UpsProfile` domain entity in the frontend
- Pre-population of UPS fields via `GET /api/v1/users/{user_id}/ups-profile` before the modal opens
- Diff-only submission: only sections with changed fields trigger sub-endpoint calls
- Concurrent IM + UPS saves via `Promise.allSettled` with per-section error banners
- Five new BFF proxy endpoints forwarding to UPS with the admin Bearer token
- A new `UserProfileServiceClient` ABC and `UserProfileServiceAdapter` in the BFF

The existing IM fields, their role gating, and the `admin-user-profile-editor` spec are not
re-specified here — they remain unchanged.

---

## Architecture

### Component Diagram

```mermaid
graph LR
    subgraph Browser
        UP[UsersPage]
        EPM[EditProfileModal]
        HUPC[HttpUserProfileClient]
        HUMR[HttpUserManagementRepository]
    end

    subgraph BFF["BFF (FastAPI)"]
        UR[users.py router]
        UMS[UserManagementService]
        UPSC[UserProfileServiceClient ABC]
        UPSA[UserProfileServiceAdapter]
    end

    subgraph UPS["User Profile Service"]
        UPSAPI[GET/PATCH /api/v1/profiles/{user_id}]
    end

    UP -->|1. getProfile| HUPC
    HUPC -->|GET /api/v1/users/{id}/ups-profile| UR
    UP -->|2. open modal| EPM
    EPM -->|updatePersonal/Contact/Display/Preferences| HUPC
    HUPC -->|PATCH /api/v1/users/{id}/ups-profile/{section}| UR
    EPM -->|updateProfile IM fields| HUMR
    HUMR -->|PATCH /api/v1/users/{id}/profile| UR
    UR --> UMS
    UMS --> UPSC
    UPSC -.->|implements| UPSA
    UPSA -->|Bearer token| UPSAPI
```

### Data Flow — Pre-Population

```
1. Admin clicks "Edit" on a user row
2. UsersPage sets button loading state
3. UsersPage calls HttpUserProfileClient.getProfile(userId)
4. HttpUserProfileClient → GET /api/v1/users/{userId}/ups-profile (BFF)
5. BFF validates JWT → require_roles(ADMIN, SUPER_ADMIN)
6. BFF → UserManagementService.get_ups_profile(user_id, token)
7. UserManagementService → UserProfileServiceAdapter.get_profile(user_id, token=token)
8. UserProfileServiceAdapter → GET {ups_base_url}/api/v1/profiles/{user_id} (UPS)
9a. UPS 200 → BFF maps to UpsProfileResponse → 200 → HttpUserProfileClient maps to UpsProfile → modal opens pre-populated
9b. UPS 404 → BFF 404 → HttpUserProfileClient throws NotFoundError → modal opens with empty fields
9c. UPS 5xx → BFF 502 → HttpUserProfileClient throws → UsersPage shows row-level error banner, modal does not open
```

### Data Flow — Save

```
1. Admin clicks "Save" in EditProfileModal
2. Modal computes diff: compare each field against initial UpsProfile values
3. Collect changed sections: personal | contact | display | preferences
4. Collect changed IM fields: displayName | email | password
5. Build concurrent call list:
   - IM fields changed → HttpUserManagementRepository.updateProfile(userId, imFields)
   - personal changed  → HttpUserProfileClient.updatePersonal(userId, personalFields)
   - contact changed   → HttpUserProfileClient.updateContact(userId, contactFields)
   - display changed   → HttpUserProfileClient.updateDisplay(userId, displayFields)
   - prefs changed     → HttpUserProfileClient.updatePreferences(userId, prefFields)
6. Promise.allSettled([...calls]) — all run concurrently
7. For each rejected promise → show per-section error banner, keep modal open
8. If all resolved → close modal, trigger user row refresh
```

---

## Components and Interfaces

### Frontend

#### `UpsProfile` Entity

File: `admin-shell/src/domain/entities/UpsProfile.ts`

```typescript
export interface UpsProfile {
  fullName: string | null;
  dateOfBirth: string | null;       // YYYY-MM-DD
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  bio: string | null;
  upsDisplayName: string | null;    // UPS display_name — distinct from IM display_name
  notificationEmail: boolean;
  notificationSms: boolean;
  notificationWhatsapp: boolean;
  language: string | null;
  timezone: string | null;
}
```

#### `UserProfileClient` Port

File: `admin-shell/src/domain/repositories/UserProfileClient.ts`

```typescript
export interface UpsPersonalFields {
  fullName?: string;
  dateOfBirth?: string;
}

export interface UpsContactFields {
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface UpsDisplayFields {
  bio?: string;
  displayName?: string;
}

export interface UpsPreferenceFields {
  notificationEmail?: boolean;
  notificationSms?: boolean;
  notificationWhatsapp?: boolean;
  language?: string;
  timezone?: string;
}

export interface UserProfileClient {
  getProfile(userId: string): Promise<UpsProfile>;
  updatePersonal(userId: string, fields: UpsPersonalFields): Promise<void>;
  updateContact(userId: string, fields: UpsContactFields): Promise<void>;
  updateDisplay(userId: string, fields: UpsDisplayFields): Promise<void>;
  updatePreferences(userId: string, fields: UpsPreferenceFields): Promise<void>;
}
```

#### `HttpUserProfileClient` Adapter

File: `admin-shell/src/infrastructure/adapters/HttpUserProfileClient.ts`

Implements `UserProfileClient`. Uses the existing `HttpClient` singleton.

Responsibilities:
- `getProfile`: `GET /api/v1/users/{userId}/ups-profile` → maps snake_case response to `UpsProfile`
  - On 404: throws a `NotFoundError`-equivalent (caught by `UsersPage` to open modal with empty fields)
  - On 5xx: throws, caught by `UsersPage` to show row-level error banner
- `updatePersonal`: `PATCH /api/v1/users/{userId}/ups-profile/personal` with `{ full_name?, date_of_birth? }`
- `updateContact`: `PATCH /api/v1/users/{userId}/ups-profile/contact` with `{ phone?, street?, city?, state?, postal_code?, country? }`
- `updateDisplay`: `PATCH /api/v1/users/{userId}/ups-profile/display` with `{ bio?, display_name? }`
- `updatePreferences`: `PATCH /api/v1/users/{userId}/ups-profile/preferences` with `{ notification_email?, notification_sms?, notification_whatsapp?, language?, timezone? }`

Response mapping (`getProfile`):

| API field (snake_case) | `UpsProfile` field (camelCase) |
|---|---|
| `full_name` | `fullName` |
| `date_of_birth` | `dateOfBirth` |
| `phone` | `phone` |
| `street` | `street` |
| `city` | `city` |
| `state` | `state` |
| `postal_code` | `postalCode` |
| `country` | `country` |
| `bio` | `bio` |
| `display_name` | `upsDisplayName` |
| `notification_preferences_email` | `notificationEmail` |
| `notification_preferences_sms` | `notificationSms` |
| `notification_preferences_whatsapp` | `notificationWhatsapp` |
| `language` | `language` |
| `timezone` | `timezone` |

Request mapping (update methods): reverse of the above — camelCase fields → snake_case body keys.

#### Extended `EditProfileModal`

File: `admin-shell/src/presentation/components/modals/EditProfileModal.tsx` (extended)

New props added to `EditProfileModalProps`:
```typescript
upsProfile: UpsProfile | null;          // null → all UPS fields empty
onSaveUps: (
  userId: string,
  section: 'personal' | 'contact' | 'display' | 'preferences',
  fields: UpsPersonalFields | UpsContactFields | UpsDisplayFields | UpsPreferenceFields
) => Promise<void>;
```

New state:
```typescript
activeTab: 'identity' | 'profile'   // default: 'identity'

// Personal
fullName: string
dateOfBirth: string

// Contact
phone: string; street: string; city: string
state: string; postalCode: string; country: string

// Display
bio: string; upsDisplayName: string

// Preferences
notificationEmail: boolean; notificationSms: boolean; notificationWhatsapp: boolean
language: string; timezone: string

// Per-section error banners (null = no error)
personalError: string | null
contactError: string | null
displayError: string | null
preferencesError: string | null

// Tab-level error indicators
identityTabHasError: boolean
profileTabHasError: boolean
```

Tab structure:
```
[ Identity | Profile ]
─────────────────────
Identity tab:
  display_name (text)
  email (text, read-only for admin)
  password (text, super_admin only)

Profile tab:
  ── Personal ──────────────────
  full_name (text)
  date_of_birth (date)
  [error banner if personalError]

  ── Contact ───────────────────
  phone (text)
  street, city, state, postal_code, country (text)
  [error banner if contactError]

  ── Display ───────────────────
  bio (textarea, max 500, live counter)
  display_name / UPS (text)
  [error banner if displayError]

  ── Preferences ───────────────
  notification_email (checkbox)
  notification_sms (checkbox)
  notification_whatsapp (checkbox)
  language (text, ISO 639-1)
  timezone (text, IANA)
  [error banner if preferencesError]
```

Diff logic (on Save):
```typescript
function computeUpsDiff(initial: UpsProfile | null, current: UpsFormState): {
  personal?: UpsPersonalFields;
  contact?: UpsContactFields;
  display?: UpsDisplayFields;
  preferences?: UpsPreferenceFields;
}
```
Each section is included only if at least one field differs from `initial` (or `initial` is null and the field is non-empty).

Save flow:
```typescript
const calls: Promise<void>[] = [];
if (imFieldsChanged) calls.push(onSave(userId, imFields));
if (diff.personal)     calls.push(onSaveUps(userId, 'personal', diff.personal));
if (diff.contact)      calls.push(onSaveUps(userId, 'contact', diff.contact));
if (diff.display)      calls.push(onSaveUps(userId, 'display', diff.display));
if (diff.preferences)  calls.push(onSaveUps(userId, 'preferences', diff.preferences));

const results = await Promise.allSettled(calls);
// map rejections to per-section error banners
// if all fulfilled → onSuccess(); onClose();
```

#### `UsersPage` Changes

File: wherever `EditProfileModal` is currently opened (e.g. `admin-shell/src/presentation/pages/UsersPage.tsx`)

On "Edit" click:
```typescript
setEditLoadingUserId(userId);
try {
  const upsProfile = await httpUserProfileClient.getProfile(userId);
  openModal(user, upsProfile);
} catch (err) {
  if (isNotFoundError(err)) {
    openModal(user, null);   // 404 → empty fields
  } else {
    setRowError(userId, 'Failed to load profile. Please try again.');
  }
} finally {
  setEditLoadingUserId(null);
}
```

---

### BFF (Python)

#### `UserProfileServiceClient` ABC

File: `src/domain/repositories/user_profile_client.py` (new file — distinct from existing `profile_client.py`)

```python
from abc import ABC, abstractmethod
from typing import Any

class UserProfileServiceClient(ABC):
    """Outbound port for UPS mutation and fetch operations."""

    @abstractmethod
    async def get_profile(self, user_id: str, *, token: str) -> dict[str, Any]: ...

    @abstractmethod
    async def update_personal(
        self, user_id: str, fields: dict[str, str], *, token: str
    ) -> None: ...

    @abstractmethod
    async def update_contact(
        self, user_id: str, fields: dict[str, str], *, token: str
    ) -> None: ...

    @abstractmethod
    async def update_display(
        self, user_id: str, fields: dict[str, Any], *, token: str
    ) -> None: ...

    @abstractmethod
    async def update_preferences(
        self, user_id: str, fields: dict[str, Any], *, token: str
    ) -> None: ...
```

No HTTP, httpx, or requests imports — pure domain port.

#### `UserProfileServiceAdapter`

File: `src/infrastructure/adapters/user_profile_service_adapter.py` (new file)

Implements `UserProfileServiceClient`. Follows the same pattern as the existing `UserProfileClient`
adapter (`src/infrastructure/adapters/user_profile_client.py`).

Key behaviors:
- Constructor: `circuit_breaker: CircuitBreaker`, `base_url: str`, `timeout: float = 10.0`
- All methods wrapped via `self._cb.call(self._<method>, ...)` — circuit breaker on every call
- Reads `correlation_id_var` from `src/presentation/middleware/correlation_id.py` and forwards as `X-Request-ID` header to UPS
- `get_profile`: `GET {base_url}/api/v1/profiles/{user_id}` → returns parsed JSON dict
- `update_personal/contact/display/preferences`: `PATCH {base_url}/api/v1/profiles/{user_id}/{sub_path}` → returns None on 2xx
- On 404: raises `NotFoundError(message=..., user_message="User profile not found")`
- On 4xx (non-404): raises `ExternalServiceError(message=..., user_message="Profile update failed")`
- On 5xx / network error: raises `ExternalServiceError(message=..., user_message="Profile service temporarily unavailable")`
- Logs `user_id`, `operation`, `duration_ms` — never field values

Sub-path mapping:

| Method | UPS path suffix |
|---|---|
| `update_personal` | `/personal` |
| `update_contact` | `/contact` |
| `update_display` | `/display` |
| `update_preferences` | `/preferences` |

#### Extended `UserManagementService`

File: `src/application/services/user_management_service.py` (extended)

Constructor gains `ups_client: UserProfileServiceClient` parameter.

New methods:

```python
async def get_ups_profile(self, user_id: str, *, token: str) -> dict[str, Any]:
    """Fetch UPS profile for a target user. Requirements: 8.2, 8.3, 8.4, 8.5, 15.1"""

async def update_ups_personal(
    self, user_id: str, fields: dict[str, str], *, token: str
) -> None:
    """Update UPS personal fields. Requirements: 9.2, 9.6, 10.1, 15.2"""

async def update_ups_contact(
    self, user_id: str, fields: dict[str, str], *, token: str
) -> None:
    """Update UPS contact fields. Requirements: 9.3, 9.6, 10.1, 15.2"""

async def update_ups_display(
    self, user_id: str, fields: dict[str, Any], *, token: str
) -> None:
    """Update UPS display fields. Requirements: 9.4, 9.6, 10.1, 10.2, 15.2"""

async def update_ups_preferences(
    self, user_id: str, fields: dict[str, Any], *, token: str
) -> None:
    """Update UPS preference fields. Requirements: 9.5, 9.6, 15.2"""
```

Each method logs `ups_profile.<operation>.started`, `ups_profile.<operation>.completed`,
and `ups_profile.<operation>.failed` with `user_id`, `section`, and `duration_ms`.
Field values are never logged.

#### New BFF Endpoints

File: `src/presentation/api/v1/users.py` (extended)

All five endpoints use `require_roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)` and
`request.cookies.get("access_token", "")` for the token — consistent with existing endpoints.

---

## Data Models

### BFF Pydantic Request Models

```python
# src/presentation/api/v1/users.py (additions)
import re
from pydantic import field_validator

class UpsPersonalUpdateRequest(BaseModel):
    full_name: str | None = None
    date_of_birth: str | None = None  # YYYY-MM-DD

    @field_validator("full_name")
    @classmethod
    def sanitize_full_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("full_name must not be blank.")
        if len(stripped) > 200:
            raise ValueError("full_name must be 200 characters or fewer.")
        return html.escape(stripped)

    @field_validator("date_of_birth")
    @classmethod
    def validate_dob(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise ValueError("date_of_birth must match YYYY-MM-DD.")
        return v


class UpsContactUpdateRequest(BaseModel):
    phone: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None

    @field_validator("phone", "street", "city", "state", "postal_code", "country", mode="before")
    @classmethod
    def sanitize_and_check_blank(cls, v: str | None) -> str | None:
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("Contact fields must not be blank when provided.")
        return html.escape(stripped)


class UpsDisplayUpdateRequest(BaseModel):
    bio: str | None = None
    display_name: str | None = None

    @field_validator("bio")
    @classmethod
    def validate_bio(cls, v: str | None) -> str | None:
        if v is None:
            return v
        escaped = html.escape(v.strip())
        if len(escaped) > 500:
            raise ValueError("bio must be 500 characters or fewer after escaping.")
        return escaped

    @field_validator("display_name")
    @classmethod
    def sanitize_display_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return html.escape(v.strip())


class UpsPreferencesUpdateRequest(BaseModel):
    notification_email: bool | None = None
    notification_sms: bool | None = None
    notification_whatsapp: bool | None = None
    language: str | None = None   # ^[a-z]{2}$
    timezone: str | None = None   # IANA, non-empty

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not re.fullmatch(r"[a-z]{2}", v):
            raise ValueError("language must be a two-letter ISO 639-1 code.")
        return v

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("timezone must not be blank.")
        return v
```

### BFF GET Response Schema

```python
class UpsProfileResponse(BaseModel):
    full_name: str | None = None
    date_of_birth: str | None = None
    phone: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    bio: str | None = None
    display_name: str | None = None          # UPS display_name
    notification_preferences_email: bool = False
    notification_preferences_sms: bool = False
    notification_preferences_whatsapp: bool = False
    language: str | None = None
    timezone: str | None = None
```

The field names in `UpsProfileResponse` are the exact inverse of the mutation request models,
ensuring round-trip consistency (Requirement 14).

### BFF Endpoint Signatures

```python
@router.get("/{user_id}/ups-profile", response_model=UpsProfileResponse)
async def get_ups_profile(user_id: str, request: Request, ...) -> UpsProfileResponse: ...

@router.patch("/{user_id}/ups-profile/personal", status_code=204)
async def update_ups_personal(user_id: str, body: UpsPersonalUpdateRequest, request: Request, ...) -> None: ...

@router.patch("/{user_id}/ups-profile/contact", status_code=204)
async def update_ups_contact(user_id: str, body: UpsContactUpdateRequest, request: Request, ...) -> None: ...

@router.patch("/{user_id}/ups-profile/display", status_code=204)
async def update_ups_display(user_id: str, body: UpsDisplayUpdateRequest, request: Request, ...) -> None: ...

@router.patch("/{user_id}/ups-profile/preferences", status_code=204)
async def update_ups_preferences(user_id: str, body: UpsPreferencesUpdateRequest, request: Request, ...) -> None: ...
```

### Frontend `UpsProfile` ↔ API Mapping

The `HttpUserProfileClient.getProfile` response mapping is the strict inverse of the update
request bodies. This guarantees that a fetch followed by an unmodified save produces no net change
(round-trip property, Requirement 14.2).

```
API GET response field              → UpsProfile field
─────────────────────────────────────────────────────
full_name                           → fullName
date_of_birth                       → dateOfBirth
phone                               → phone
street                              → street
city                                → city
state                               → state
postal_code                         → postalCode
country                             → country
bio                                 → bio
display_name                        → upsDisplayName
notification_preferences_email      → notificationEmail
notification_preferences_sms        → notificationSms
notification_preferences_whatsapp   → notificationWhatsapp
language                            → language
timezone                            → timezone
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a
system — essentially, a formal statement about what the system should do. Properties serve as the
bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: UPS profile pre-population maps all fields

*For any* valid `UpsProfileResponse` returned by the BFF, `HttpUserProfileClient.getProfile` must
produce a `UpsProfile` entity where every field corresponds exactly to the matching API response
field via the defined snake_case → camelCase mapping, with no fields dropped or defaulted
incorrectly.

**Validates: Requirements 1.3, 1.7, 14.3**

### Property 2: Diff-only section submission

*For any* initial `UpsProfile` and any set of edits applied to the modal form, the set of
sub-endpoint calls made on Save must be exactly the set of sections where at least one field
differs from the initial value — no more, no less.

**Validates: Requirements 3.4, 4.3, 5.4, 6.4, 7.1, 7.2**

### Property 3: Concurrent IM + UPS submission

*For any* modal state where both IM fields and UPS fields have changed, all resulting calls
(IM update + relevant UPS sub-endpoints) must be initiated concurrently via `Promise.allSettled`,
and each call's success or failure must be handled independently without blocking the others.

**Validates: Requirements 7.3**

### Property 4: Per-section error banners on failure

*For any* set of concurrent save calls where a subset fails, the modal must display an error
banner for each failed section, must not close, and must not show error banners for sections
that succeeded.

**Validates: Requirements 7.4**

### Property 5: Role enforcement on all UPS proxy endpoints

*For any* request to any of the five UPS proxy endpoints (`GET` + four `PATCH`) that does not
carry a JWT with `admin` or `super_admin` role, the BFF must return HTTP 403 before reaching
any service logic.

**Validates: Requirements 8.1, 9.1, 13.1**

### Property 6: BFF Pydantic validation rejects invalid UPS mutation payloads

*For any* UPS mutation request body that violates the Pydantic model constraints (blank
`full_name`, invalid `date_of_birth` format, blank contact fields, `bio` > 500 chars,
`language` not matching `^[a-z]{2}$`, blank `timezone`), the BFF must return HTTP 422 with
field-level errors before the request reaches `UserManagementService`.

**Validates: Requirements 9.2, 9.3, 9.4, 9.5**

### Property 7: HTML escaping of all UPS string fields

*For any* UPS mutation request body containing HTML special characters (`<`, `>`, `&`, `"`, `'`)
in string fields, the value forwarded to `UserProfileServiceAdapter` must have those characters
replaced with their HTML entity equivalents via `html.escape`.

**Validates: Requirements 10.1, 10.2**

### Property 8: Circuit breaker fast-fail

*For any* call to `UserProfileServiceAdapter` when the circuit breaker is in the OPEN state,
the adapter must raise `ExternalServiceError` immediately without making an HTTP request to UPS.

**Validates: Requirements 12.7**

### Property 9: UPS profile round-trip consistency

*For any* valid `UpsProfile` object, fetching the profile via `GET /api/v1/users/{user_id}/ups-profile`
and then submitting all fields unchanged via the four PATCH sub-endpoints must result in no net
change to the UPS data — the GET response schema contains exactly the fields accepted by the
mutation endpoints.

**Validates: Requirements 14.1, 14.2**

### Property 10: Safe error messages — no UPS internals exposed

*For any* UPS upstream error (4xx, 5xx, network failure), the `user_message` returned by the BFF
to the client must not contain UPS stack traces, internal error codes, field values, or service
URLs — only a generic safe message.

**Validates: Requirements 15.4**

### Property 11: X-Request-ID propagation to UPS

*For any* BFF request that carries an `X-Request-ID` header (or has one generated by
`CorrelationIdMiddleware`), `UserProfileServiceAdapter` must forward that same correlation ID
as an `X-Request-ID` header on every outbound UPS call.

**Validates: Requirements 15.5**

### Property 12: Frontend validation rejects invalid personal fields

*For any* string composed entirely of whitespace submitted as `full_name`, or any string not
matching `YYYY-MM-DD` submitted as `date_of_birth`, the modal must display a field-level
validation error and must not call any sub-endpoint.

**Validates: Requirements 3.2, 3.3**

### Property 13: Frontend validation rejects invalid phone format

*For any* string containing characters outside `[0-9 +\-()\s]` submitted as `phone`, the modal
must display a field-level validation error and must not call the contact sub-endpoint.

**Validates: Requirements 4.2**

### Property 14: Frontend bio length validation and live counter

*For any* bio string of length N (0 ≤ N ≤ 500), the live character counter must display
`500 - N` remaining characters. *For any* bio string of length > 500, the modal must display
a field-level validation error and must not call the display sub-endpoint.

**Validates: Requirements 5.2, 5.3**

### Property 15: Frontend language format validation

*For any* string not matching `^[a-z]{2}$` submitted as `language`, the modal must display a
field-level validation error and must not call the preferences sub-endpoint.

**Validates: Requirements 6.2**

### Property 16: Tab-level error indicators

*For any* modal state where at least one field in a tab has a validation error, that tab's
header must display an error indicator; tabs with no validation errors must not show an indicator.

**Validates: Requirements 2.4**

---

## Error Handling

### Frontend Error Scenarios

| Scenario | Behavior |
|---|---|
| `getProfile` returns 404 | Open modal with `upsProfile = null` (all UPS fields empty) |
| `getProfile` returns 5xx / network error | Show dismissible row-level error banner; do not open modal |
| UPS sub-endpoint returns 4xx/5xx on save | Show per-section error banner inside modal; keep modal open |
| IM update fails on save | Show IM error banner inside modal; keep modal open |
| All save calls succeed | Close modal; trigger user row refresh |
| Frontend validation fails | Show field-level errors; do not submit any call |

### BFF Error Scenarios

| Scenario | BFF Response | Log fields |
|---|---|---|
| Missing/invalid JWT | 401 (handled by JWT middleware) | — |
| Role not admin/super_admin | 403 | `user_id`, `path` |
| Pydantic validation failure | 422 with field errors | — |
| UPS returns 404 | 404 with safe `user_message` | `user_id`, `duration_ms` |
| UPS returns 4xx (non-404) | 4xx with safe `user_message` | `user_id`, `section`, `duration_ms` |
| UPS returns 5xx / network error | 502 with safe `user_message` | `user_id`, `section`, `duration_ms` |
| Circuit breaker open | 502 with safe `user_message` | `user_id`, `operation` |

### Domain Exceptions Used

- `NotFoundError` — UPS 404 on `get_profile`
- `ExternalServiceError` — UPS 4xx/5xx, circuit breaker open, network errors
- `AuthorizationError` — role check failures (handled by `require_roles` dependency)

All exceptions follow the platform `DomainError` hierarchy from `src/domain/exceptions.py`.
`message` is for internal logs only; `user_message` is the safe client-facing string.

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. Unit tests cover specific examples,
integration points, and edge cases. Property tests verify universal correctness across all inputs.

### Frontend Unit Tests (vitest)

**`HttpUserProfileClient.test.ts`**
- Mock `fetch` / `HttpClient`; test `getProfile` maps all 15 fields correctly (example)
- Test `getProfile` on 404 throws a recognizable not-found error (edge case)
- Test `getProfile` on 5xx throws (edge case)
- Test each `updateX` sends the correct snake_case body (example per method)

**`EditProfileModal.test.tsx`**
- Test modal renders with "Identity" tab active by default (example — Req 2.2)
- Test clicking "Profile" tab shows four sections (example — Req 2.3)
- Test ARIA attributes: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (example — Req 2.6)
- Test diff logic: only changed sections trigger calls (property — Property 2)
- Test no calls when nothing changed (edge case — Req 7.2)
- Test `Promise.allSettled` — partial failure shows per-section banners, modal stays open (property — Property 4)
- Test all succeed → modal closes (example — Req 7.5)
- Test bio character counter updates on input (property — Property 14)
- Test whitespace `full_name` rejected (property — Property 12)
- Test invalid `date_of_birth` rejected (property — Property 12)
- Test invalid `phone` rejected (property — Property 13)
- Test `bio` > 500 chars rejected (property — Property 14)
- Test invalid `language` rejected (property — Property 15)
- Test tab error indicators appear when tab has validation errors (property — Property 16)

**`UsersPage.test.tsx`** (additions)
- Test Edit button shows loading state during `getProfile` fetch (example — Req 1.2)
- Test 404 opens modal with null upsProfile (edge case — Req 1.4)
- Test 5xx shows row-level error banner, modal does not open (edge case — Req 1.5)

### Frontend Property-Based Tests (vitest + fast-check)

Minimum 100 iterations per property test. Each test references its design property.

**`HttpUserProfileClient.property.test.ts`**
```
// Feature: admin-extended-profile-editor, Property 1: UPS profile pre-population maps all fields
// For any valid UpsProfileResponse shape, getProfile produces a correctly mapped UpsProfile
```

**`EditProfileModal.property.test.tsx`**
```
// Feature: admin-extended-profile-editor, Property 2: Diff-only section submission
// For any initial UpsProfile and any set of edits, only changed sections trigger calls

// Feature: admin-extended-profile-editor, Property 14: Bio length validation and live counter
// For any bio string of length N, counter shows 500-N; strings > 500 are rejected
```

### BFF Unit Tests (pytest)

**`tests/unit/presentation/test_ups_profile_endpoints.py`**
- Test 403 for non-admin role on all five endpoints (property — Property 5)
- Test 422 for invalid `full_name` (blank, > 200 chars) (property — Property 6)
- Test 422 for invalid `date_of_birth` format (property — Property 6)
- Test 422 for blank contact fields (property — Property 6)
- Test 422 for `bio` > 500 chars (property — Property 6)
- Test 422 for invalid `language` (property — Property 6)
- Test 422 for blank `timezone` (edge case — Req 9.5)
- Test 204 on valid payload — service method called with sanitized fields (example — Req 9.6)
- Test 200 on GET — service method called, response mapped to `UpsProfileResponse` (example — Req 8.3)

**`tests/unit/infrastructure/test_user_profile_service_adapter.py`**
- Test `get_profile` calls correct UPS URL with Bearer token (example — Req 12.1)
- Test `NotFoundError` raised on 404 (edge case — Req 12.4)
- Test `ExternalServiceError` raised on 4xx non-404 (edge case — Req 12.5)
- Test `ExternalServiceError` raised on 5xx (edge case — Req 12.5)
- Test circuit breaker open raises `ExternalServiceError` without HTTP call (property — Property 8)
- Test `X-Request-ID` forwarded from `correlation_id_var` (property — Property 11)
- Test each `update_*` method calls correct PATCH sub-path (example per method)

**`tests/unit/application/test_user_management_service_ups.py`**
- Mock `UserProfileServiceClient` ABC with `AsyncMock(spec=UserProfileServiceClient)`
- Test `get_ups_profile` delegates to `ups_client.get_profile` and returns result (example)
- Test `get_ups_profile` logs `ups_profile.fetch.started` and `ups_profile.fetch.completed` (example)
- Test `get_ups_profile` logs `ups_profile.fetch.failed` with `duration_ms` on error (example)
- Test each `update_ups_*` method logs `section` and `duration_ms` (example)
- Test no field values appear in any log call (property — Req 10.4)

### BFF Property-Based Tests (pytest + hypothesis)

Minimum 100 examples per `@given` test.

```python
# Feature: admin-extended-profile-editor, Property 7: HTML escaping of all UPS string fields
# For any string with HTML special chars, the forwarded value has them escaped

# Feature: admin-extended-profile-editor, Property 6: Pydantic validation rejects invalid payloads
# For any bio string of length > 500, UpsDisplayUpdateRequest raises ValidationError

# Feature: admin-extended-profile-editor, Property 9: UPS profile round-trip consistency
# For any UpsProfileResponse, the field set equals the union of all mutation request fields
```

### Property-Based Testing Libraries

- Frontend: `fast-check` (npm package)
- BFF: `hypothesis` (Python package)
- Both configured for minimum 100 iterations per property test
