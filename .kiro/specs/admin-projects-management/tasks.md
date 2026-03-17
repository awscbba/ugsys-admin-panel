# Implementation Plan: admin-projects-management

## Overview

Build the projects management micro-frontend plugin (`projects-plugin/`) for the admin panel. The plugin is a standalone React 19 + TypeScript Vite bundle following hexagonal architecture (domain → infrastructure → presentation). Implementation proceeds bottom-up: scaffolding → domain entities & validation → infrastructure API client → presentation stores/hooks/components → plugin entry point → final wiring. Property-based tests (fast-check) and unit tests (@testing-library/react) are interleaved with implementation tasks.

Package manager: pnpm. Test tools (vitest, fast-check, @testing-library/react, msw) are already in admin-shell devDependencies and will be referenced from the plugin's own package.json.

## Tasks

- [x] 1. Scaffold plugin project structure
  - [x] 1.1 Create `projects-plugin/package.json` with React 19, TypeScript, nanostores, and dev dependencies (vitest, fast-check, @testing-library/react, msw, @testing-library/jest-dom)
    - Configure `pnpm` scripts: `build`, `dev`, `test`, `test:coverage`, `typecheck`
    - Import `ugsys-ui-lib` design tokens (`tokens.css`) and reference the shared Tailwind preset for consistent theming
    - _Requirements: 1.6, 14.6_
  - [x] 1.2 Create `projects-plugin/tsconfig.json` with strict mode, JSX react-jsx, path aliases for `@domain`, `@infrastructure`, `@presentation`
    - _Requirements: 14.1_
  - [x] 1.3 Create `projects-plugin/vite.config.ts` in library mode producing a single IIFE bundle
    - Output to `dist/projects-plugin.js`, global name `__mfe_projects_registry`
    - _Requirements: 1.6, 14.6_
  - [x] 1.4 Create directory structure: `src/domain/entities/`, `src/domain/repositories/`, `src/infrastructure/api/`, `src/presentation/components/`, `src/presentation/hooks/`, `src/presentation/stores/`
    - _Requirements: 14.1_

- [x] 2. Implement domain layer — entities and types
  - [x] 2.1 Create `src/domain/entities/Project.ts` — `Project`, `ProjectImage`, `ProjectStatus`, `CreateProjectData`, `ProjectUpdateData` interfaces
    - _Requirements: 14.5, 3.1, 4.2_
  - [x] 2.2 Create `src/domain/entities/Subscription.ts` — `Subscription`, `SubscriptionStatus` interfaces and `getAvailableActions(status)` pure function
    - _Requirements: 14.5, 6.4, 6.7_
  - [x] 2.3 Create `src/domain/entities/FormSchema.ts` — `FormSchema`, `CustomField`, `FieldType` interfaces, `generateFieldId()` and `shouldShowOptionsEditor(fieldType)` pure functions
    - _Requirements: 14.5, 7.9, 7.6_
  - [x] 2.4 Create `src/domain/entities/Dashboard.ts` — `EnhancedDashboardData`, `ProjectStats`, `AnalyticsData` interfaces
    - _Requirements: 14.5, 8.1_
  - [x] 2.5 Create `src/domain/entities/Pagination.ts` — `PaginatedResponse<T>`, `PaginatedQuery` interfaces
    - _Requirements: 14.5_
  - [x] 2.6 Create `src/domain/entities/Context.ts` — `MicroFrontendContext` interface (userId, roles, displayName, getAccessToken, navigate)
    - _Requirements: 1.1, 1.4, 1.5_
  - [x] 2.7 Create `src/domain/entities/Errors.ts` — `ApiError`, `SessionExpiredError`, `AccessDeniedError`, `NotFoundError`, `ServerError`, `NetworkError`, `ValidationError` typed error classes
    - _Requirements: 10.4, 10.5, 10.6, 10.7_
  - [ ]* 2.8 Write property test for subscription action visibility (Property 4)
    - **Property 4: Subscription action visibility is determined by status**
    - Test `getAvailableActions` with `fc.constantFrom('pending', 'active', 'rejected', 'cancelled')` — verify correct action sets
    - **Validates: Requirements 6.4, 6.7**
  - [ ]* 2.9 Write property test for unique field IDs (Property 11)
    - **Property 11: Unique field IDs for new custom fields**
    - Generate N IDs via `fc.integer({ min: 1, max: 50 })`, verify all distinct
    - **Validates: Requirements 7.9**
  - [ ]* 2.10 Write property test for poll options editor visibility (Property 12)
    - **Property 12: Poll field options editor visibility**
    - Test `shouldShowOptionsEditor` with `fc.constantFrom('text', 'textarea', 'poll_single', 'poll_multiple', 'date', 'number')`
    - **Validates: Requirements 7.6**

- [x] 3. Implement domain layer — validation and repository interface
  - [x] 3.1 Create `src/domain/validation.ts` — `validateProjectForm(data)` and `validateFormSchema(fields)` pure functions returning `ValidationResult`
    - Validate required fields, max_participants > 0, end_date >= start_date, non-empty questions, poll options >= 2
    - _Requirements: 3.2, 3.3, 3.4, 4.5, 7.14, 7.15_
  - [x] 3.2 Create `src/domain/repositories/ProjectsRepository.ts` — TypeScript interface defining all API methods
    - _Requirements: 14.2, 14.3, 10.3_
  - [ ]* 3.3 Write property test for project form validation rejects invalid input (Property 1)
    - **Property 1: Project form validation rejects invalid input**
    - `fc.record` with at least one required field empty, or max_participants <= 0, or end_date < start_date → `{ valid: false }`
    - **Validates: Requirements 3.2, 3.3, 3.4, 4.5**
  - [ ]* 3.4 Write property test for project form validation accepts valid input (Property 2)
    - **Property 2: Project form validation accepts valid input**
    - `fc.record` with all fields valid, max_participants > 0, end_date >= start_date → `{ valid: true, errors: {} }`
    - **Validates: Requirements 3.2, 3.3, 3.4, 4.5**
  - [ ]* 3.5 Write property test for form schema validation (Property 3)
    - **Property 3: Form schema validation**
    - `fc.array(customFieldArb)` with random empty questions or poll fields with < 2 options
    - **Validates: Requirements 7.14, 7.15**

- [x] 4. Checkpoint — Domain layer complete
  - Ensure all domain tests pass (`pnpm --filter projects-plugin test`), ask the user if questions arise.

- [x] 5. Implement infrastructure layer — API client
  - [x] 5.1 Create `src/infrastructure/api/ProjectsApiClient.ts` implementing `ProjectsRepository`
    - Private `request<T>(method, path, body?)` method routing through BFF proxy at `/api/v1/proxy/projects-registry/`
    - Include `Authorization: Bearer <token>` and `X-Request-ID` headers
    - Read `csrf_token` cookie and include `X-CSRF-Token` header on state-changing requests (POST, PUT, PATCH, DELETE)
    - Implement `classifyError(response)` mapping 401/403/404/422/5xx to typed error classes
    - Implement all 13 repository methods with correct HTTP methods and URL paths
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_
  - [x] 5.2 Implement `computeModifiedFields(original, edited)` utility in `src/domain/diffUtils.ts`
    - Returns object containing only fields that differ between original and edited project
    - Used by `updateProject` to send only changed fields in PUT body
    - _Requirements: 4.6_
  - [ ]* 5.3 Write property test for API request construction (Property 5)
    - **Property 5: API request construction**
    - Verify all requests URL starts with `/api/v1/proxy/projects-registry/`, Authorization header present, X-Request-ID present, X-CSRF-Token present on POST/PUT/DELETE
    - **Validates: Requirements 10.1, 10.2, 10.8, 10.9**
  - [ ]* 5.4 Write property test for HTTP error classification (Property 6)
    - **Property 6: HTTP error classification**
    - `fc.constantFrom(401, 403, 404, 500, 502, 503)` + random response bodies → correct error type
    - **Validates: Requirements 10.4, 10.5, 10.6, 10.7**
  - [ ]* 5.5 Write property test for API query parameters match state (Property 13)
    - **Property 13: API query parameters match filter/sort/page state**
    - `fc.record` of query state → verify URL query params encode that state exactly
    - **Validates: Requirements 2.7**
  - [ ]* 5.6 Write property test for error messages do not expose internals (Property 14)
    - **Property 14: Error messages do not expose internal server details**
    - Random error bodies with forbidden substrings (`Traceback`, `DynamoDB`, `ClientError`, file paths) → verify stripped from user-facing message
    - **Validates: Requirements 12.3**
  - [ ]* 5.7 Write property test for edit sends only modified fields (Property 7)
    - **Property 7: Edit form sends only modified fields**
    - `fc.record` for original project + `fc.record` for edits → `computeModifiedFields` returns only changed fields
    - Test file: `domain/diffUtils.property.test.ts`
    - **Validates: Requirements 4.6**
  - [ ]* 5.8 Write unit tests for `ProjectsApiClient`
    - Test each method calls correct endpoint with correct HTTP method
    - Test 204 handling for delete operations
    - Test response envelope unwrapping (`json.data`)
    - Mock `fetch` globally
    - _Requirements: 10.3_

- [x] 6. Checkpoint — Infrastructure layer complete
  - Ensure all domain + infrastructure tests pass, ask the user if questions arise.

- [x] 7. Implement presentation layer — routing and stores
  - [x] 7.1 Create `src/presentation/hooks/usePluginRouter.ts` — route matcher, URL query serializer/parser, `matchRoute(pathname)` function
    - Match routes: `/projects`, `/projects/new`, `/projects/:id`, `/projects/:id/edit`, `/projects/:id/subscriptions`, `/projects/:id/form-schema`, `/` and `/dashboard` (both map to Dashboard)
    - `serializeQueryParams(state)` and `parseQueryParams(search)` for filter/sort/page state (including `search` text filter)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 7.2 Create nanostores atoms: `projectListStore.ts`, `projectDetailStore.ts`, `subscriptionStore.ts`, `formSchemaStore.ts`, `dashboardStore.ts`, `toastStore.ts`
    - Each store: atom with initial state, action functions (load, create, update, delete as applicable)
    - Actions call `ProjectsApiClient` methods, update loading/error/data state
    - `projectListStore`: create new `AbortController` on each filter/sort/page change, abort previous in-flight request; debounce text inputs (name search, category) at 300ms
    - `toastStore`: FIFO queue (max 3 visible), `showToast(message, type)` enqueues, each toast auto-dismisses after 5 seconds
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 12.1, 2.14_
  - [x] 7.3 Create `src/presentation/stores/index.ts` — export `resetAllStores()` that resets every atom to initial value
    - _Requirements: 11.6_
  - [ ]* 7.4 Write property test for URL query string round-trip (Property 8)
    - **Property 8: URL query string round-trip for project list filters**
    - `fc.record` of filter/sort/page state → serialize → parse → compare equality
    - **Validates: Requirements 9.4**
  - [ ]* 7.5 Write property test for route matching (Property 9)
    - **Property 9: Route matching maps paths to correct views**
    - Known routes → correct view identifier; unknown paths → `not-found`
    - **Validates: Requirements 9.1, 9.3**
  - [ ]* 7.6 Write property test for store reset on unmount (Property 10)
    - **Property 10: Store reset on unmount clears all state**
    - Set random state in all atoms → call `resetAllStores()` → verify all atoms equal initial values
    - **Validates: Requirements 11.6**
  - [ ]* 7.7 Write unit tests for stores
    - Test `projectListStore` load action updates items/total/loading/error
    - Test `toastStore` auto-dismiss after 5 seconds (fake timers)
    - Test error handling sets error state and clears loading
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 12.1_

- [x] 8. Implement presentation layer — shared components
  - [x] 8.1 Create `src/presentation/components/Toast.tsx` — toast notification with `aria-live="polite"`, auto-dismiss, success/error variants
    - _Requirements: 12.1, 13.4_
  - [x] 8.2 Create `src/presentation/components/ConfirmDialog.tsx` — modal dialog with `role="dialog"`, `aria-labelledby`, focus trapping, confirm/cancel buttons
    - Disable confirm button while action is in progress
    - _Requirements: 12.4, 12.5, 13.6_
  - [x] 8.3 Create `src/presentation/components/NotFound.tsx` — "Page not found" message with link to projects list
    - _Requirements: 9.3_
  - [ ]* 8.4 Write unit tests for Toast component
    - Test renders message, auto-dismisses, has `aria-live` region
    - _Requirements: 12.1, 13.4_
  - [ ]* 8.5 Write unit tests for ConfirmDialog component
    - Test focus trapping, confirm/cancel actions, disabled state during loading
    - _Requirements: 12.5, 13.6_

- [x] 9. Implement presentation layer — Dashboard
  - [x] 9.1 Create `src/presentation/components/Dashboard.tsx` — metric cards (total projects, active projects, total subscriptions, pending subscriptions), analytics display, loading skeleton, error with retry, quick-action links
    - Use semantic HTML, `aria-live` for loading states
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 13.3, 13.4_
  - [ ]* 9.2 Write unit tests for Dashboard component
    - Test renders metric cards, loading state, error with retry button, quick-action links
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 10. Implement presentation layer — ProjectList
  - [x] 10.1 Create `src/presentation/components/ProjectList.tsx` — paginated table with filter/sort controls, loading skeleton, error with retry, CRUD action buttons per row
    - Use `<table>` with proper `<thead>`/`<tbody>`, status badges with `aria-label`
    - Status filter dropdown, category filter input, text search input (debounced 300ms), sort controls, pagination with page size selector (10, 20, 50)
    - "Create Project", "Edit", "View", "Delete" actions
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 13.1, 13.2, 13.3, 13.5_
  - [ ]* 10.2 Write unit tests for ProjectList component
    - Test renders project rows with all fields, loading skeleton, error with retry, pagination controls, filter/sort interactions
    - _Requirements: 2.1, 2.2, 2.6, 2.8, 2.9_

- [x] 11. Implement presentation layer — ProjectForm (create + edit)
  - [x] 11.1 Create `src/presentation/components/ProjectForm.tsx` — shared form for create and edit modes
    - Create mode: empty form, POST on submit, navigate to detail on success
    - Edit mode: fetch and pre-populate, status dropdown, is_enabled toggle, PUT with only modified fields on submit
    - Client-side validation via `validateProjectForm`, per-field error display
    - Notification emails add/remove interface
    - Cancel button, loading states, disabled submit while in progress
    - All inputs with `<label>` or `aria-label`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 12.2, 12.3, 12.4, 13.1, 13.2_
  - [ ]* 11.2 Write unit tests for ProjectForm component
    - Test create mode renders empty form, edit mode pre-populates, validation errors shown per-field, submit calls correct API, cancel navigates back
    - _Requirements: 3.1, 3.2, 3.6, 3.7, 3.10, 4.1, 4.5, 4.6_

- [x] 12. Implement presentation layer — ProjectDetail
  - [x] 12.1 Create `src/presentation/components/ProjectDetail.tsx` — full project display with all fields, form schema preview, action buttons (Edit, Manage Subscriptions, Edit Form Schema, Delete), loading/error states
    - Render rich_text as HTML, images as thumbnails, status badge with color
    - Delete with ConfirmDialog, success toast on delete, navigate to list
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 12.1, 12.2, 12.4, 12.5, 13.3, 13.5_
  - [ ]* 12.2 Write unit tests for ProjectDetail component
    - Test renders all fields, form schema preview, action buttons, delete confirmation flow, loading/error states
    - _Requirements: 5.1, 5.2, 5.4, 5.8, 5.10, 5.11_

- [x] 13. Checkpoint — Core views complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement presentation layer — SubscriptionManager
  - [x] 14.1 Create `src/presentation/components/SubscriptionManager.tsx` — paginated subscription table with approve/reject/cancel actions, status badges, pagination, back-to-project link
    - Approve: direct PUT call
    - Reject: prompt for optional reason, then PUT
    - Cancel: ConfirmDialog, then DELETE
    - Disable action buttons while request in progress
    - Refresh list and show toast on success
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 12.1, 12.4, 13.1, 13.3, 13.5_
  - [ ]* 14.2 Write unit tests for SubscriptionManager component
    - Test renders subscription rows, approve/reject/cancel actions, pagination, error handling
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.8, 6.9_

- [x] 15. Implement presentation layer — FormSchemaEditor
  - [x] 15.1 Create `src/presentation/components/FormSchemaEditor.tsx` — visual form builder with add/remove/reorder fields, field type dropdown, question input, required toggle, poll options editor, save/cancel buttons
    - Generate unique IDs for new fields via `generateFieldId()`
    - Show options editor only for `poll_single`/`poll_multiple` via `shouldShowOptionsEditor()`
    - Validate via `validateFormSchema` before save
    - Reorder via up/down arrow buttons
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 7.14, 7.15, 12.1, 13.1, 13.2_
  - [ ]* 15.2 Write unit tests for FormSchemaEditor component
    - Test add/remove fields, reorder, poll options editor visibility, save calls API, validation errors
    - _Requirements: 7.2, 7.3, 7.6, 7.7, 7.8, 7.10, 7.14_

- [x] 16. Implement App root and plugin entry point
  - [x] 16.1 Create `src/presentation/App.tsx` — root component that reads current URL, matches route via `usePluginRouter`, renders the correct view component, provides context to children
    - _Requirements: 9.1, 9.2, 1.4_
  - [x] 16.2 Create `entry.ts` — `mount(container, context)` creates React root and renders `<App>`, `unmount(container)` unmounts root and calls `resetAllStores()`, assigns to `window.__mfe_projects_registry`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 11.6_
  - [ ]* 16.3 Write unit tests for entry.ts
    - Test mount renders content into container, unmount clears container, `window.__mfe_projects_registry` is assigned with mount/unmount
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 17. Final checkpoint — All tests pass
  - Run full test suite: `pnpm --filter projects-plugin test`
  - Run type check: `pnpm --filter projects-plugin typecheck`
  - Verify architecture guard: `domain/` has zero imports from `infrastructure/` or `presentation/`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples, edge cases, and UI rendering
- The plugin reuses vitest, fast-check, @testing-library/react, and msw from admin-shell devDependencies
- pnpm is the package manager for all operations
