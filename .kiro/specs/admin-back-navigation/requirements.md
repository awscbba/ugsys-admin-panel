# Requirements Document

## Introduction

The admin panel at `https://admin.apps.cloud.org.bo` currently provides no way for authenticated admins to navigate back to the main dashboard once they are on a plugin or configuration page (`/users`, `/audit`, `/config/:serviceName`, `/app/:serviceName/*`). There is no home link, back button, or breadcrumb in the content area or top bar.

This feature adds persistent back-navigation affordances at the shell level so that admins can always return to `/dashboard` from any route, without relying on the browser's back button. The solution must work for all route types: built-in views (`/users`, `/audit`) and dynamic routes (`/config/:serviceName`, `/app/:serviceName/*`).

## Glossary

- **Admin_Shell**: The React SPA (`admin-shell`) that provides the authenticated layout — `AppShell`, `Sidebar`, `TopBar`, and the `<Outlet>` content area.
- **Sidebar**: The persistent left-side navigation component (`Sidebar.tsx`) that renders grouped `NavigationEntry` items.
- **TopBar**: The persistent top header component (`TopBar.tsx`) that currently shows the user's display name, avatar, and logout button.
- **Dashboard**: The `/dashboard` route rendered by `HealthDashboard`, which serves as the home/root page of the admin panel.
- **Dashboard_Link**: A hardcoded navigation entry in the Sidebar that always links to `/dashboard`, independent of the service registry.
- **Breadcrumb**: A secondary navigation element rendered in the content area header that shows the current location as a path and provides a link back to the Dashboard.
- **Section_Title**: A human-readable label for the current route displayed in the TopBar (e.g., "Users", "Audit Log", "Config — identity-manager").
- **Built_in_Route**: A route defined statically in `App.tsx`: `/dashboard`, `/users`, `/audit`.
- **Dynamic_Route**: A route resolved at runtime from the service registry: `/config/:serviceName` and `/app/:serviceName/*`.
- **NavigationEntry**: The data structure (`{ label, icon, path, requiredRoles, group, order }`) used by the Sidebar to render navigation links.
- **Active_Route**: The route whose `path` matches the current `location.pathname`.

---

## Requirements

### Requirement 1: Persistent Dashboard Link in the Sidebar

**User Story:** As an admin, I want a permanent "Dashboard" link always visible at the top of the sidebar, so that I can return to the main dashboard from any page without using the browser back button.

#### Acceptance Criteria

1. THE Admin_Shell SHALL render a Dashboard_Link as the first item in the Sidebar, above all service-registry-derived navigation groups.
2. THE Dashboard_Link SHALL navigate to `/dashboard` when activated.
3. THE Dashboard_Link SHALL be visible to all authenticated users regardless of their assigned roles.
4. WHILE the Active_Route is `/dashboard`, THE Sidebar SHALL render the Dashboard_Link with the active visual state (brand-colored text and left border accent, consistent with existing active link styling).
5. WHILE the Active_Route is any route other than `/dashboard`, THE Sidebar SHALL render the Dashboard_Link with the inactive visual state.
6. THE Dashboard_Link SHALL remain visible and functional regardless of whether any services are registered in the service registry.
7. IF the service registry returns zero entries, THEN THE Sidebar SHALL still render the Dashboard_Link as the sole navigation item.

---

### Requirement 2: Section Title in the TopBar

**User Story:** As an admin, I want the top bar to show the name of the current section I am viewing, so that I always know where I am in the admin panel.

#### Acceptance Criteria

1. WHEN the Active_Route is `/dashboard`, THE TopBar SHALL display the Section_Title "Dashboard".
2. WHEN the Active_Route is `/users`, THE TopBar SHALL display the Section_Title "Users".
3. WHEN the Active_Route is `/audit`, THE TopBar SHALL display the Section_Title "Audit Log".
4. WHEN the Active_Route is `/config/:serviceName`, THE TopBar SHALL display a Section_Title composed of "Config — " followed by the `serviceName` path parameter.
5. WHEN the Active_Route is `/app/:serviceName/*`, THE TopBar SHALL display a Section_Title composed of the registered service's `manifest.navigation[0].label` if available, or the `serviceName` path parameter if no label is registered.
6. THE TopBar SHALL derive the Section_Title from the current URL using React Router's `useLocation` and `useParams` hooks, without requiring prop drilling from parent components.
7. IF the Active_Route does not match any known pattern, THEN THE TopBar SHALL display an empty Section_Title string.

---

### Requirement 3: Breadcrumb Navigation for Deep Routes

**User Story:** As an admin, I want a breadcrumb with a back link shown at the top of the content area when I am on a configuration or plugin page, so that I can return to the dashboard with a single click.

#### Acceptance Criteria

1. WHEN the Active_Route matches `/config/:serviceName`, THE Admin_Shell SHALL render a Breadcrumb in the content area above the page content.
2. WHEN the Active_Route matches `/app/:serviceName/*`, THE Admin_Shell SHALL render a Breadcrumb in the content area above the page content.
3. THE Breadcrumb SHALL contain a "Dashboard" link that navigates to `/dashboard` when activated.
4. THE Breadcrumb SHALL display the current Section_Title as the terminal (non-linked) segment after the "Dashboard" link.
5. WHEN the Active_Route is a Built_in_Route (`/dashboard`, `/users`, `/audit`), THE Admin_Shell SHALL NOT render a Breadcrumb.
6. THE Breadcrumb "Dashboard" link SHALL use React Router's `<Link>` component so that navigation does not trigger a full page reload.
7. THE Breadcrumb SHALL be rendered at the shell level (inside `AppShell`) and SHALL NOT require modification of individual view components (`ConfigForm`, `MicroFrontendLoader`, `UserManagement`, etc.).

---

### Requirement 4: Keyboard and Accessibility Compliance

**User Story:** As an admin using keyboard navigation or assistive technology, I want all back-navigation affordances to be fully accessible, so that I can navigate the admin panel without a mouse.

#### Acceptance Criteria

1. THE Dashboard_Link SHALL be reachable via sequential keyboard focus (Tab key) in the Sidebar.
2. THE Dashboard_Link SHALL be activatable via the Enter key when focused.
3. THE Breadcrumb "Dashboard" link SHALL be reachable via sequential keyboard focus.
4. THE Breadcrumb "Dashboard" link SHALL be activatable via the Enter key when focused.
5. THE Breadcrumb SHALL include an `aria-label="Breadcrumb"` attribute on its container element.
6. THE Breadcrumb terminal segment (current page name) SHALL carry `aria-current="page"`.
7. THE Dashboard_Link SHALL carry `aria-current="page"` WHILE the Active_Route is `/dashboard`, and SHALL NOT carry `aria-current` on any other route.
8. THE Section_Title rendered in the TopBar SHALL be wrapped in an element with `aria-live="polite"` so that screen readers announce route changes.

---

### Requirement 5: Route-Change Consistency

**User Story:** As an admin, I want the navigation affordances to update immediately when I navigate between pages, so that the Dashboard link, breadcrumb, and section title always reflect the current route.

#### Acceptance Criteria

1. WHEN the Active_Route changes, THE Sidebar SHALL update the Dashboard_Link's active state within the same render cycle.
2. WHEN the Active_Route changes, THE TopBar SHALL update the Section_Title within the same render cycle.
3. WHEN the Active_Route changes from a Dynamic_Route to a Built_in_Route, THE Admin_Shell SHALL remove the Breadcrumb within the same render cycle.
4. WHEN the Active_Route changes from a Built_in_Route to a Dynamic_Route, THE Admin_Shell SHALL render the Breadcrumb within the same render cycle.
5. THE Admin_Shell SHALL derive all navigation state from React Router's `useLocation` hook so that browser back/forward navigation also triggers correct updates.
6. IF a micro-frontend loaded at `/app/:serviceName/*` performs an internal navigation that changes the sub-path, THEN THE Breadcrumb Section_Title SHALL reflect the top-level `serviceName` and SHALL NOT change based on the sub-path.
