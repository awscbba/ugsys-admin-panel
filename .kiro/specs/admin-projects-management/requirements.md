# Requirements Document

## Introduction

The `ugsys-admin-panel` currently loads micro-frontend plugins from registered services but has no projects management plugin. The old `ugsys-projects-registry/web/` frontend provided full project administration (CRUD, subscriptions, form schemas, dashboard) that administrators relied on daily. This feature builds the projects management micro-frontend plugin that the admin shell loads when the `projects-registry` service manifest is fetched.

The plugin is a React + TypeScript micro-frontend bundle that the admin shell's `MicroFrontendLoader` mounts into its plugin viewport. It communicates with the `projects-registry` backend exclusively through the BFF proxy (`/api/v1/proxy/projects-registry/{path}`). The plugin covers seven functional areas: project listing, project creation, project editing, project detail view, subscription management, form schema editing, and an admin dashboard with analytics.

All plugin views require `admin` or `super_admin` role. The plugin follows the admin shell's hexagonal architecture (domain/infrastructure/presentation layers) and uses `nanostores` for state management, consistent with the existing admin shell codebase.

## Glossary

- **Plugin**: The projects management micro-frontend bundle loaded by the Admin_Shell's `MicroFrontendLoader` via the `projects-registry` Plugin Manifest `entryPoint` URL.
- **Admin_Shell**: The React 19 + TypeScript SPA that serves as the admin panel host, loads plugins, and provides shared context (user, auth, navigation).
- **BFF_Proxy**: The admin panel BFF endpoint `ANY /api/v1/proxy/{service_name}/{path}` that forwards authenticated requests to downstream services.
- **Projects_API**: The `projects-registry` backend REST API at `/api/v1/projects/` that provides project CRUD operations.
- **Subscriptions_API**: The `projects-registry` backend REST API at `/api/v1/projects/{project_id}/subscriptions` and `/api/v1/projects/{project_id}/subscribers/{subscription_id}` that provides subscription management operations.
- **Admin_API**: The `projects-registry` backend REST API at `/api/v1/admin/` that provides dashboard metrics, analytics, and user listing.
- **Form_Schema_API**: The `projects-registry` backend REST API at `PUT /api/v1/projects/{id}/form-schema` that updates a project's dynamic form schema.
- **Project**: A community initiative entity with fields: id, name, description, rich_text, category, status, is_enabled, max_participants, current_participants, start_date, end_date, created_by, notification_emails, images, form_schema, created_at, updated_at.
- **Project_Status**: The lifecycle state of a Project, one of: `pending`, `active`, `completed`, `cancelled`.
- **Subscription**: A volunteer enrollment entity with fields: id, project_id, person_id, status, notes, created_at, updated_at.
- **Subscription_Status**: The state of a Subscription, one of: `pending`, `active`, `rejected`, `cancelled`.
- **Form_Schema**: A dynamic form definition containing an ordered list of Custom_Field entries attached to a Project.
- **Custom_Field**: A single form field with fields: id, field_type, question, required, options[].
- **Field_Type**: The type of a Custom_Field, one of: `text`, `textarea`, `poll_single`, `poll_multiple`, `date`, `number`.
- **Paginated_Response**: A response envelope containing `items[]`, `total`, `page`, and `page_size` fields for paginated list endpoints.
- **MicroFrontendContext**: The shared context object passed by the Admin_Shell to the plugin's `mount()` function, containing userId, roles, displayName, getAccessToken, and navigate.
- **Plugin_Entry**: The plugin's exported module with `mount(container, context)` and optional `unmount(container)` functions, assigned to `window.__mfe_projects_registry`.

## Requirements

### Requirement 1: Plugin Module Entry Point

**User Story:** As the Admin_Shell, I want the projects management plugin to export a standard `mount`/`unmount` interface, so that the MicroFrontendLoader can load and render the plugin in the plugin viewport.

#### Acceptance Criteria

1. THE Plugin SHALL export a `mount(container: HTMLElement, context: MicroFrontendContext)` function that renders the plugin's React component tree into the provided container element.
2. THE Plugin SHALL export an `unmount(container: HTMLElement)` function that cleanly unmounts the React component tree and releases all resources (stores, event listeners, pending HTTP requests).
3. THE Plugin SHALL assign its module exports to `window.__mfe_projects_registry` so the Admin_Shell's script-tag loader can retrieve the module after the bundle executes.
4. WHEN the `mount` function is called, THE Plugin SHALL use the `MicroFrontendContext.navigate` function for all internal route transitions instead of triggering full page reloads.
5. WHEN the `mount` function is called, THE Plugin SHALL use the `MicroFrontendContext.getAccessToken` function to obtain the JWT for authenticated API calls through the BFF_Proxy.
6. THE Plugin SHALL be built as a single Vite-bundled JavaScript file suitable for loading via a `<script>` tag.

---

### Requirement 2: Projects List View

**User Story:** As an admin, I want to see a paginated list of all projects with filtering and sorting options, so that I can quickly find and manage projects.

#### Acceptance Criteria

1. WHEN the admin navigates to `/projects`, THE Plugin SHALL display a paginated list of projects fetched from the Projects_API via the BFF_Proxy.
2. THE Plugin SHALL display each project's name, category, Project_Status, is_enabled state, current_participants, max_participants, start_date, and end_date in the list.
3. THE Plugin SHALL provide a status filter dropdown that allows filtering projects by Project_Status (`pending`, `active`, `completed`, `cancelled`).
4. THE Plugin SHALL provide a category filter input that allows filtering projects by category.
5. THE Plugin SHALL provide sort controls that allow sorting by `created_at`, `name`, or `start_date` in ascending or descending order.
6. THE Plugin SHALL display pagination controls showing current page, total pages, and page size selector (10, 20, 50 items per page).
7. WHEN the admin changes a filter, sort, or pagination parameter, THE Plugin SHALL fetch the updated project list from the Projects_API with the corresponding query parameters. Text filter inputs SHALL be debounced (300ms) and stale in-flight requests SHALL be cancelled via `AbortController` before issuing a new request.
8. THE Plugin SHALL display a loading indicator while project data is being fetched.
9. IF the Projects_API returns an error, THEN THE Plugin SHALL display an error message with a retry button.
10. THE Plugin SHALL provide a "Create Project" button that navigates to the project creation form.
11. THE Plugin SHALL provide an "Edit" action for each project row that navigates to the project edit form.
12. THE Plugin SHALL provide a "View" action for each project row that navigates to the project detail view.
13. THE Plugin SHALL provide a "Delete" action for each project row that prompts for confirmation before deleting.
14. THE Plugin SHALL provide a text search input that filters projects by name (case-insensitive substring match), debounced at 300ms to avoid excessive API calls.

---

### Requirement 3: Project Creation Form

**User Story:** As an admin, I want to create new projects with all required fields, so that I can set up community initiatives for volunteers.

#### Acceptance Criteria

1. WHEN the admin navigates to the project creation form, THE Plugin SHALL display a form with input fields for: name, description, category, start_date, end_date, max_participants, notification_emails, rich_text, image_url, and cloudfront_url.
2. THE Plugin SHALL validate that name, description, category, start_date, end_date, and max_participants are provided before submission.
3. THE Plugin SHALL validate that max_participants is a positive integer.
4. THE Plugin SHALL validate that end_date is equal to or later than start_date.
5. THE Plugin SHALL allow the admin to enter multiple notification_emails as a comma-separated list or via an add/remove interface.
6. WHEN the admin submits a valid form, THE Plugin SHALL send a POST request to the Projects_API via the BFF_Proxy with the form data.
7. WHEN the Projects_API returns a successful response, THE Plugin SHALL navigate to the project detail view for the newly created project.
8. IF the Projects_API returns a validation error, THEN THE Plugin SHALL display the error message near the relevant form field.
9. IF the Projects_API returns a server error, THEN THE Plugin SHALL display a general error message with a retry option.
10. THE Plugin SHALL provide a "Cancel" button that navigates back to the projects list without submitting.

---

### Requirement 4: Project Edit Form

**User Story:** As an admin, I want to edit existing projects, so that I can update project details, change status, and enable or disable projects.

#### Acceptance Criteria

1. WHEN the admin navigates to the project edit form for a given project ID, THE Plugin SHALL fetch the project data from the Projects_API via the BFF_Proxy and pre-populate all form fields.
2. THE Plugin SHALL display editable fields for: name, description, rich_text, category, start_date, end_date, max_participants, notification_emails, image_url, cloudfront_url, status, and is_enabled.
3. THE Plugin SHALL provide a status dropdown with options: `pending`, `active`, `completed`, `cancelled`.
4. THE Plugin SHALL provide an is_enabled toggle switch.
5. THE Plugin SHALL apply the same validation rules as the creation form for shared fields (name required, max_participants positive, end_date >= start_date).
6. WHEN the admin submits the edit form, THE Plugin SHALL send a PUT request to the Projects_API via the BFF_Proxy with only the modified fields.
7. WHEN the Projects_API returns a successful response, THE Plugin SHALL navigate to the project detail view and display a success notification.
8. IF the Projects_API returns an error, THEN THE Plugin SHALL display the error message and keep the form populated with the submitted values.
9. THE Plugin SHALL display a loading indicator while fetching the project data for pre-population.
10. IF the project is not found, THEN THE Plugin SHALL display a "Project not found" message with a link back to the projects list.

---

### Requirement 5: Project Detail View

**User Story:** As an admin, I want to view complete project details including subscription count and form schema preview, so that I can review project information at a glance.

#### Acceptance Criteria

1. WHEN the admin navigates to the project detail view for a given project ID, THE Plugin SHALL fetch the enhanced project data from `GET /api/v1/projects/{id}/enhanced` via the BFF_Proxy.
2. THE Plugin SHALL display all project fields: name, description, rich_text (rendered as HTML), category, Project_Status with a colored badge, is_enabled state, max_participants, current_participants, start_date, end_date, created_by, notification_emails, created_at, and updated_at.
3. THE Plugin SHALL display project images with their cloudfront_url as thumbnails.
4. WHEN the project has a Form_Schema, THE Plugin SHALL display a read-only preview of the form fields showing each Custom_Field's question, Field_Type, required status, and options.
5. THE Plugin SHALL provide an "Edit" button that navigates to the project edit form.
6. THE Plugin SHALL provide a "Manage Subscriptions" button that navigates to the subscription management view for the project.
7. THE Plugin SHALL provide an "Edit Form Schema" button that navigates to the form schema editor for the project.
8. THE Plugin SHALL provide a "Delete" button that prompts for confirmation before sending a DELETE request to the Projects_API via the BFF_Proxy.
9. WHEN the project is successfully deleted, THE Plugin SHALL navigate to the projects list and display a success notification.
10. THE Plugin SHALL display a loading indicator while fetching project data.
11. IF the project is not found, THEN THE Plugin SHALL display a "Project not found" message with a link back to the projects list.

---

### Requirement 6: Subscription Management

**User Story:** As an admin, I want to view and manage subscriptions for each project, so that I can approve, reject, or cancel volunteer enrollments.

#### Acceptance Criteria

1. WHEN the admin navigates to the subscription management view for a given project ID, THE Plugin SHALL fetch the paginated subscription list from `GET /api/v1/projects/{project_id}/subscriptions` via the BFF_Proxy.
2. THE Plugin SHALL display each subscription's person_id, Subscription_Status with a colored badge, notes, created_at, and updated_at.
3. THE Plugin SHALL display pagination controls for the subscription list with page size options (10, 20, 50).
4. WHEN a subscription has Subscription_Status `pending`, THE Plugin SHALL display "Approve" and "Reject" action buttons.
5. WHEN the admin clicks "Approve" on a pending subscription, THE Plugin SHALL send a PUT request to `PUT /api/v1/projects/{project_id}/subscribers/{subscription_id}` with `action: "approve"` via the BFF_Proxy.
6. WHEN the admin clicks "Reject" on a pending subscription, THE Plugin SHALL prompt for an optional rejection reason and send a PUT request with `action: "reject"` and the reason via the BFF_Proxy.
7. WHEN a subscription has Subscription_Status `active` or `pending`, THE Plugin SHALL display a "Cancel" action button.
8. WHEN the admin clicks "Cancel" on a subscription, THE Plugin SHALL prompt for confirmation and send a DELETE request to `DELETE /api/v1/projects/{project_id}/subscribers/{subscription_id}` via the BFF_Proxy.
9. WHEN a subscription action succeeds, THE Plugin SHALL refresh the subscription list and display a success notification.
10. IF a subscription action fails, THEN THE Plugin SHALL display the error message returned by the Subscriptions_API.
11. THE Plugin SHALL provide a "Back to Project" link that navigates to the project detail view.

---

### Requirement 7: Form Schema Editor

**User Story:** As an admin, I want a visual form builder to create and edit custom form fields for a project, so that I can define the data collected from volunteers during subscription.

#### Acceptance Criteria

1. WHEN the admin navigates to the form schema editor for a given project ID, THE Plugin SHALL fetch the project's current Form_Schema from the Projects_API via the BFF_Proxy and display the existing Custom_Field entries.
2. THE Plugin SHALL provide an "Add Field" button that appends a new empty Custom_Field to the form.
3. THE Plugin SHALL allow the admin to set each Custom_Field's field_type via a dropdown with options: `text`, `textarea`, `poll_single`, `poll_multiple`, `date`, `number`.
4. THE Plugin SHALL allow the admin to set each Custom_Field's question as a text input.
5. THE Plugin SHALL allow the admin to toggle each Custom_Field's required flag.
6. WHEN a Custom_Field has field_type `poll_single` or `poll_multiple`, THE Plugin SHALL display an options editor that allows adding, editing, and removing option strings.
7. THE Plugin SHALL allow the admin to remove a Custom_Field from the form via a "Remove" button on each field.
8. THE Plugin SHALL allow the admin to reorder Custom_Field entries via drag-and-drop or up/down arrow buttons.
9. THE Plugin SHALL generate a unique id for each new Custom_Field.
10. WHEN the admin clicks "Save", THE Plugin SHALL send a PUT request to `PUT /api/v1/projects/{id}/form-schema` via the BFF_Proxy with the complete fields array.
11. WHEN the Form_Schema_API returns a successful response, THE Plugin SHALL display a success notification.
12. IF the Form_Schema_API returns an error, THEN THE Plugin SHALL display the error message and preserve the current editor state.
13. THE Plugin SHALL provide a "Cancel" button that navigates back to the project detail view without saving.
14. THE Plugin SHALL validate that every Custom_Field has a non-empty question before allowing save.
15. WHEN a Custom_Field has field_type `poll_single` or `poll_multiple`, THE Plugin SHALL validate that the field has at least two options before allowing save.

---

### Requirement 8: Admin Dashboard

**User Story:** As an admin, I want a dashboard showing project metrics and analytics, so that I can monitor the overall state of the projects registry.

#### Acceptance Criteria

1. WHEN the admin navigates to the dashboard view (accessible from the plugin's navigation), THE Plugin SHALL fetch dashboard data from `GET /api/v1/admin/dashboard/enhanced` via the BFF_Proxy.
2. THE Plugin SHALL display summary metric cards for: total projects, active projects, total subscriptions, and pending subscriptions.
3. THE Plugin SHALL fetch analytics data from `GET /api/v1/admin/analytics` via the BFF_Proxy and display project distribution by status and category.
4. THE Plugin SHALL display a loading indicator while dashboard data is being fetched.
5. IF the Admin_API returns an error, THEN THE Plugin SHALL display an error message with a retry button.
6. THE Plugin SHALL provide quick-action links to navigate to the projects list and subscription management views.

---

### Requirement 9: Plugin Internal Routing

**User Story:** As an admin, I want seamless navigation between plugin views without full page reloads, so that the experience feels like a native part of the admin panel.

#### Acceptance Criteria

1. THE Plugin SHALL implement internal routing for the following paths: `/projects` (list), `/projects/new` (create), `/projects/:id` (detail), `/projects/:id/edit` (edit), `/projects/:id/subscriptions` (subscriptions), `/projects/:id/form-schema` (form editor).
2. THE Plugin SHALL use the `MicroFrontendContext.navigate` function for all route transitions to stay within the Admin_Shell's SPA router.
3. WHEN the admin navigates to an unknown path within the plugin's route space, THE Plugin SHALL display a "Page not found" message with a link to the projects list.
4. THE Plugin SHALL preserve filter, sort, and pagination state in the URL query parameters for the projects list view so that browser back/forward navigation restores the previous state.

---

### Requirement 10: API Communication Layer

**User Story:** As a developer, I want a clean API client layer that handles all communication with the projects-registry backend through the BFF proxy, so that API calls are consistent, authenticated, and error-handled.

#### Acceptance Criteria

1. THE Plugin SHALL route all API requests through the BFF_Proxy at `/api/v1/proxy/projects-registry/{path}`.
2. THE Plugin SHALL include the JWT obtained from `MicroFrontendContext.getAccessToken()` in the `Authorization` header of every API request.
3. THE Plugin SHALL implement a typed API client with methods for each backend endpoint: list projects, create project, get project, get enhanced project, update project, delete project, list subscriptions, approve subscription, reject subscription, cancel subscription, update form schema, get dashboard, get enhanced dashboard, and get analytics.
4. WHEN the BFF_Proxy returns HTTP 401, THE Plugin SHALL notify the user that the session has expired and avoid retrying the request.
5. WHEN the BFF_Proxy returns HTTP 403, THE Plugin SHALL display an "Access denied" message.
6. WHEN the BFF_Proxy returns HTTP 404, THE Plugin SHALL display a "Resource not found" message.
7. WHEN the BFF_Proxy returns HTTP 5xx, THE Plugin SHALL display a generic error message and provide a retry option.
8. THE Plugin SHALL include the `X-Request-ID` header from the Admin_Shell's correlation ID context in every API request for distributed tracing.
9. THE Plugin SHALL read the `csrf_token` cookie and include it as the `X-CSRF-Token` header on all state-changing requests (POST, PUT, PATCH, DELETE), consistent with the Admin_Shell's `HttpClient` CSRF handling pattern.

---

### Requirement 11: State Management

**User Story:** As a developer, I want centralized state management using nanostores, so that plugin components share data efficiently and consistently with the existing admin shell patterns.

#### Acceptance Criteria

1. THE Plugin SHALL use `nanostores` atoms for managing project list state (items, total, page, filters, sort, loading, error).
2. THE Plugin SHALL use `nanostores` atoms for managing the currently viewed project detail state.
3. THE Plugin SHALL use `nanostores` atoms for managing subscription list state per project.
4. THE Plugin SHALL use `nanostores` atoms for managing form schema editor state.
5. THE Plugin SHALL use `nanostores` atoms for managing dashboard metrics state.
6. WHEN the `unmount` function is called, THE Plugin SHALL reset all store atoms to their initial values to prevent stale state on re-mount.

---

### Requirement 12: Error Handling and User Feedback

**User Story:** As an admin, I want clear feedback for all actions (success, loading, errors), so that I know the result of every operation I perform.

#### Acceptance Criteria

1. WHEN a create, update, or delete operation succeeds, THE Plugin SHALL display a toast notification with a success message that auto-dismisses after 5 seconds.
2. WHEN an API request is in progress, THE Plugin SHALL display a loading indicator appropriate to the context (skeleton for page loads, spinner for action buttons).
3. WHEN an API request fails, THE Plugin SHALL display an error message that includes the error description from the API response without exposing internal server details.
4. THE Plugin SHALL disable action buttons (save, delete, approve, reject) while the corresponding API request is in progress to prevent duplicate submissions.
5. WHEN a delete confirmation dialog is displayed, THE Plugin SHALL require the admin to explicitly confirm the action before proceeding.

---

### Requirement 13: Accessibility

**User Story:** As a user with accessibility needs, I want the plugin to be keyboard-navigable and screen-reader friendly, so that I can manage projects regardless of how I interact with the interface.

#### Acceptance Criteria

1. THE Plugin SHALL ensure all interactive elements (buttons, links, form inputs, dropdowns) are focusable via keyboard Tab navigation.
2. THE Plugin SHALL ensure all form inputs have associated `<label>` elements or `aria-label` attributes.
3. THE Plugin SHALL use semantic HTML elements (`<table>`, `<form>`, `<nav>`, `<main>`, `<button>`) for their intended purposes.
4. THE Plugin SHALL announce dynamic content changes (toast notifications, loading states, error messages) to screen readers via `aria-live` regions.
5. THE Plugin SHALL ensure all status badges and icons have text alternatives via `aria-label` or visually hidden text.
6. THE Plugin SHALL ensure confirmation dialogs are modal with proper focus trapping and `role="dialog"` with `aria-labelledby`.

---

### Requirement 14: Plugin Architecture

**User Story:** As a developer, I want the plugin to follow the hexagonal architecture pattern used by the admin shell, so that the codebase is consistent, testable, and maintainable.

#### Acceptance Criteria

1. THE Plugin SHALL organize its source code into three layers: `domain/` (entities, types), `infrastructure/` (API client, HTTP adapters), and `presentation/` (React components, hooks, stores).
2. THE Plugin's domain layer SHALL have zero imports from the infrastructure or presentation layers.
3. THE Plugin's infrastructure layer SHALL implement typed interfaces defined in the domain layer for API communication.
4. THE Plugin's presentation layer SHALL depend on the domain layer for types and on the infrastructure layer for data fetching, following the same dependency direction as the Admin_Shell.
5. THE Plugin SHALL define TypeScript interfaces for all domain entities: Project, Subscription, Form_Schema, Custom_Field, Dashboard_Metrics, and Paginated_Response.
6. THE Plugin SHALL be buildable independently via Vite, producing a single JS bundle that the Admin_Shell loads at runtime.
