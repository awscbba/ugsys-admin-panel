# Requirements Document

## Introduction

Cross-frontend dark/light theme switching for the ugsys platform. The shared UI library (`@ugsys/ui-lib`) currently defines basic brand tokens in `src/tokens/tokens.css` (`--color-primary`, `--color-brand`, `--color-accent`, `--color-footer`, `--color-background`, `--color-focus-ring`, `--font-sans`) under a single `:root` selector with no dark-theme variants. The library also exports shared components (Navbar, Footer, UserMenu, LoginCard) and a hook (useFocusManagement) that currently use hardcoded light-theme colors.

This feature introduces a cross-frontend theming system split across two packages:

- **`@ugsys/ui-lib`** (shared): Owns the design token definitions (light + dark), a reusable theme store hook, a ThemeProvider component, and ensures all exported components respond to theme changes via CSS custom properties.
- **`ugsys-admin-panel`** (consumer): Wires the ThemeProvider at the app root, renders the theme toggle in its ProfileDropdown, migrates its own inline hardcoded colors to semantic tokens, and applies the early-load script to prevent flash of wrong theme.

Plugin micro-frontends inherit the theme automatically via the `data-theme` attribute set on the `<html>` element by the host shell, requiring no theme logic of their own.

## Glossary

- **Theme_Provider**: A React context provider exported from `@ugsys/ui-lib` that wraps the application root, initializes the Theme_Store, and applies the active theme to the DOM.
- **Theme_Toggle**: A UI control rendered inside the admin-panel's ProfileDropdown that allows the user to switch between light and dark themes.
- **Theme_Store**: A reusable Nanostores-based hook exported from `@ugsys/ui-lib` that holds the active theme value, synchronizes it with localStorage, and sets the `data-theme` attribute on the `<html>` element.
- **Design_Tokens**: CSS custom properties defined in `@ugsys/ui-lib`'s `src/tokens/tokens.css` that map semantic names (e.g. `--color-surface`, `--color-text-primary`) to concrete color values per theme.
- **Admin_Shell**: The React 19 + TypeScript single-page application that serves as the admin panel host (`admin-shell/`).
- **System_Preference**: The value reported by the `prefers-color-scheme` CSS media query, reflecting the user's operating system or browser color scheme setting.
- **Theme_Transition**: A CSS transition applied to background and color properties when the theme changes, providing a smooth visual switch.
- **UI_Lib**: The shared React component library (`@ugsys/ui-lib`) that exports components, hooks, design tokens, and theme utilities consumed by all ugsys frontends.
- **Plugin_Microfrontend**: A remotely loaded micro-frontend (e.g. projects-registry plugin, user-profile plugin) rendered inside the Admin_Shell's plugin viewport via Module Federation.
- **Consumer_Frontend**: Any frontend application that imports `@ugsys/ui-lib`, including the Admin_Shell and any future standalone frontends.

## Requirements

### Requirement 1: Shared Design Token Definitions (UI_Lib)

**User Story:** As a frontend developer, I want all semantic UI color tokens defined in the shared UI library with light and dark variants, so that any frontend importing `@ugsys/ui-lib` gets theme support without defining its own tokens.

#### Acceptance Criteria

1. THE Design_Tokens in UI_Lib SHALL define a set of semantic CSS custom properties for surface colors, text colors, border colors, and interactive-state colors under a `:root` (light) selector and a `[data-theme="dark"]` selector in `src/tokens/tokens.css`.
2. THE Design_Tokens SHALL include at minimum the following semantic tokens: `--color-surface`, `--color-surface-elevated`, `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-border`, `--color-input-bg`, `--color-input-border`, `--color-error`, `--color-error-bg`, and `--color-error-border`.
3. THE Design_Tokens SHALL preserve the existing `--color-primary`, `--color-brand`, `--color-accent`, `--color-footer`, `--color-background`, `--color-focus-ring`, and `--font-sans` tokens and keep their light-theme values unchanged under `:root`.
4. WHEN the `[data-theme="dark"]` attribute is set on the `<html>` element, THE Design_Tokens SHALL override each semantic token and each existing brand token (where appropriate) with dark-theme color values.
5. THE Design_Tokens SHALL be importable by any Consumer_Frontend via a standard CSS import from `@ugsys/ui-lib` (e.g. `import '@ugsys/ui-lib/tokens'` or equivalent package export path).

### Requirement 2: Shared Theme Store Hook (UI_Lib)

**User Story:** As a frontend developer, I want a reusable theme store hook exported from the shared UI library, so that any frontend can manage theme state consistently without reimplementing persistence and DOM synchronization logic.

#### Acceptance Criteria

1. THE UI_Lib SHALL export a `useTheme` hook that returns the current theme value (`"light"` or `"dark"`) and a `toggleTheme` function.
2. THE Theme_Store SHALL expose a reactive atom holding the current theme value as either `"light"` or `"dark"`.
3. THE Theme_Store SHALL expose a `toggleTheme` function that switches the current theme from `"light"` to `"dark"` or from `"dark"` to `"light"`.
4. WHEN the theme value changes, THE Theme_Store SHALL set the `data-theme` attribute on the `<html>` element to the new theme value.
5. WHEN the theme value changes, THE Theme_Store SHALL persist the new value to `localStorage` under the key `ugsys-theme`.
6. WHEN a Consumer_Frontend initializes and `localStorage` contains a previously saved theme value, THE Theme_Store SHALL restore that value as the active theme.
7. WHEN a Consumer_Frontend initializes and `localStorage` does not contain a saved theme value, THE Theme_Store SHALL use the System_Preference as the default theme.
8. THE `useTheme` hook and Theme_Store SHALL be exported from `@ugsys/ui-lib`'s public API via `src/index.ts`.

### Requirement 3: Shared Theme Provider Component (UI_Lib)

**User Story:** As a frontend developer, I want a ThemeProvider component exported from the shared UI library, so that any frontend can wrap its root component and get automatic theme initialization and DOM synchronization.

#### Acceptance Criteria

1. THE UI_Lib SHALL export a `ThemeProvider` React component that initializes the Theme_Store and applies the active theme on mount.
2. THE ThemeProvider SHALL accept an optional `defaultTheme` prop (`"light"` or `"dark"`) to override the initial theme when no persisted value or System_Preference is available.
3. WHEN the ThemeProvider mounts, THE ThemeProvider SHALL set the `data-theme` attribute on the `<html>` element to the resolved active theme.
4. THE ThemeProvider SHALL be exported from `@ugsys/ui-lib`'s public API via `src/index.ts`.

### Requirement 4: System Preference Detection (UI_Lib)

**User Story:** As a user, I want the application to respect my operating system color scheme preference on first visit, so that the UI matches my system settings without manual configuration.

#### Acceptance Criteria

1. WHEN no theme value exists in `localStorage`, THE Theme_Store SHALL read the System_Preference via the `prefers-color-scheme` media query and apply `"dark"` when the query matches `dark`, or `"light"` otherwise.
2. WHILE no theme value exists in `localStorage` and the user has not manually toggled the theme, THE Theme_Store SHALL listen for changes to the `prefers-color-scheme` media query and update the active theme accordingly.
3. WHEN the user manually toggles the theme via a Consumer_Frontend's toggle control, THE Theme_Store SHALL stop listening for System_Preference changes and use only the persisted value.

### Requirement 5: UI_Lib Component Theming (UI_Lib)

**User Story:** As a frontend developer, I want the shared components (Navbar, Footer, UserMenu, LoginCard) to respond to theme changes automatically, so that all frontends using these components get consistent themed rendering.

#### Acceptance Criteria

1. THE Navbar component in UI_Lib SHALL use semantic Design_Tokens for all color-related styles instead of hardcoded hex values or light-only token references.
2. THE Footer component in UI_Lib SHALL use semantic Design_Tokens for all color-related styles instead of hardcoded hex values or light-only token references.
3. THE UserMenu component in UI_Lib SHALL use semantic Design_Tokens for all color-related styles instead of hardcoded hex values or light-only token references.
4. THE LoginCard component in UI_Lib SHALL use semantic Design_Tokens for all color-related styles instead of hardcoded hex values or light-only token references.
5. WHEN the `data-theme` attribute on the `<html>` element changes, THE UI_Lib components SHALL reflect the new theme colors without requiring a re-render or prop change.

### Requirement 6: Theme Toggle UI (Admin_Shell)

**User Story:** As an admin user, I want a visible toggle in the profile dropdown to switch between light and dark themes, so that I can choose my preferred appearance.

#### Acceptance Criteria

1. THE Theme_Toggle SHALL be rendered as a menu item inside the Admin_Shell's ProfileDropdown component, positioned before the "Logout" menu item.
2. THE Theme_Toggle SHALL display a sun icon and the label "Light" when the current theme is `"dark"`, and a moon icon and the label "Dark" when the current theme is `"light"`.
3. WHEN the user activates the Theme_Toggle, THE Theme_Toggle SHALL call the `toggleTheme` function from the `useTheme` hook imported from `@ugsys/ui-lib`.
4. THE Theme_Toggle SHALL have `role="menuitem"` and participate in the existing ArrowUp/ArrowDown keyboard navigation of the ProfileDropdown.

### Requirement 7: Admin Shell Theme Wiring (Admin_Shell)

**User Story:** As a developer, I want the admin panel to wire the shared ThemeProvider at its app root and apply the early-load script, so that the admin panel gets theme support with no flash of wrong theme.

#### Acceptance Criteria

1. THE Admin_Shell SHALL wrap its root component tree with the ThemeProvider imported from `@ugsys/ui-lib`.
2. THE Admin_Shell SHALL apply the theme from `localStorage` via an inline `<script>` in `index.html` (or equivalent early-execution mechanism) to prevent a flash of the wrong theme on page load.
3. IF the persisted `localStorage` value is corrupted or contains an invalid value, THEN THE Admin_Shell's early-load script SHALL fall back to the System_Preference and remove the invalid entry from `localStorage`.

### Requirement 8: Admin Shell Inline Style Migration (Admin_Shell)

**User Story:** As a developer, I want all hardcoded color values in the admin panel's inline styles replaced with CSS custom property references, so that admin-panel components respond to theme changes automatically.

#### Acceptance Criteria

1. THE Admin_Shell SHALL replace all hardcoded hex color values in inline `style` attributes across layout components (AppShell, Sidebar, TopBar, ProfileDropdown) with references to the corresponding semantic CSS custom properties from UI_Lib.
2. THE Admin_Shell SHALL replace all hardcoded hex color values in inline `style` attributes across modal components (EditProfileModal, SelfEditProfileModal) with references to the corresponding semantic CSS custom properties from UI_Lib.
3. THE Admin_Shell SHALL replace all hardcoded hex color values in inline `style` attributes across view components (LoginPage, HealthDashboard, UserManagement, AuditLog, ConfigForm) with references to the corresponding semantic CSS custom properties from UI_Lib.
4. IF a component uses a Tailwind utility class that references a design token (e.g. `bg-primary`, `text-brand`), THE Admin_Shell SHALL keep that class unchanged and ensure the underlying token resolves correctly in both themes.

### Requirement 9: Plugin Micro-Frontend Theme Inheritance

**User Story:** As a plugin developer, I want my micro-frontend to inherit the host shell's theme automatically, so that I do not need to implement any theme switching logic in my plugin.

#### Acceptance Criteria

1. WHEN the Admin_Shell sets the `data-theme` attribute on the `<html>` element, THE Plugin_Microfrontend SHALL inherit the active theme via CSS custom property resolution without importing or initializing the Theme_Store.
2. WHEN a Plugin_Microfrontend imports components from `@ugsys/ui-lib`, THE Plugin_Microfrontend SHALL receive correctly themed components that respond to the `data-theme` attribute set by the host shell.
3. WHEN the user toggles the theme in the Admin_Shell, THE Plugin_Microfrontend SHALL reflect the new theme colors without requiring a page reload or plugin re-initialization.

### Requirement 10: Theme Transition

**User Story:** As a user, I want a smooth visual transition when switching themes, so that the change feels polished rather than jarring.

#### Acceptance Criteria

1. WHEN the theme changes, THE UI_Lib's Design_Tokens stylesheet SHALL define a CSS transition of 200ms duration on `background-color` and `color` properties for the `<body>` element and primary layout containers.
2. THE transition SHALL use the `transition-property` CSS property scoped to color-related properties only, to avoid unintended transitions on layout or transform properties.
3. IF the user has the `prefers-reduced-motion: reduce` media query active, THEN THE UI_Lib's Design_Tokens stylesheet SHALL disable theme transition animations by setting transition duration to 0ms.

### Requirement 11: Accessibility

**User Story:** As a user with accessibility needs, I want the theme toggle and themed UI to meet accessibility standards, so that the application remains usable regardless of theme.

#### Acceptance Criteria

1. THE Theme_Toggle in the Admin_Shell SHALL have an accessible label that conveys the action (e.g. "Switch to dark theme" or "Switch to light theme") via `aria-label`.
2. WHILE the dark theme is active, THE Design_Tokens SHALL maintain a minimum contrast ratio of 4.5:1 between text and background colors for all body text, as defined by WCAG 2.1 Level AA.
3. WHILE the light theme is active, THE Design_Tokens SHALL maintain a minimum contrast ratio of 4.5:1 between text and background colors for all body text, as defined by WCAG 2.1 Level AA.
4. THE Theme_Toggle SHALL be focusable via keyboard and activatable via Enter or Space keys.
