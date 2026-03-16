# Implementation Tasks

## Tasks

- [x] 1. Implement useSectionTitle hook
  - [x] 1.1 Create `admin-shell/src/presentation/hooks/useSectionTitle.ts` mapping `/dashboard`, `/users`, `/audit`, `/config/:serviceName`, and `/app/:serviceName/*` to their respective titles; fall back to `""` for unmatched routes; derive service label from `$serviceRegistry` store for `/app/` routes
  - [x] 1.2 Write unit tests in `useSectionTitle.test.ts` covering all route patterns, the registry-label fallback for `/app/` routes, and the empty-string fallback for unmatched routes

- [x] 2. Add Section Title to TopBar
  - [x] 2.1 Update `admin-shell/src/presentation/components/layout/TopBar.tsx` to call `useSectionTitle` and render the result in a left-aligned `<span aria-live="polite">` element; keep the profile/logout area right-aligned

- [x] 3. Add Dashboard Link to Sidebar
  - [x] 3.1 Update `admin-shell/src/presentation/components/layout/Sidebar.tsx` to render a `<NavLink to="/dashboard">` as the first item, before all service-registry-derived groups; apply active styles (brand text + left border) via `NavLink`'s `isActive` callback; set `aria-current="page"` when active

- [x] 4. Build Breadcrumb component
  - [x] 4.1 Create `admin-shell/src/presentation/components/layout/Breadcrumb.tsx` with `aria-label="Breadcrumb"` on the container, a `<Link to="/dashboard">` first segment, a separator, and a `<span aria-current="page">` terminal segment showing `currentTitle`
  - [x] 4.2 Write unit tests in `Breadcrumb.test.tsx` covering: renders Dashboard link, renders currentTitle with aria-current, Dashboard link uses React Router Link (no full reload)

- [x] 5. Integrate Breadcrumb into AppShell
  - [x] 5.1 Update `admin-shell/src/presentation/components/layout/AppShell.tsx` to call `useSectionTitle` and derive `showBreadcrumb` from `useLocation` (`pathname.startsWith("/config/")` or `pathname.startsWith("/app/")`); render `<Breadcrumb currentTitle={sectionTitle} />` before `<Outlet>` when `showBreadcrumb` is true
