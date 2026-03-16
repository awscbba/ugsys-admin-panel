# Implementation Plan: Admin Theme Switcher

## Overview

The vast majority of this feature is already implemented. The UI-lib tokens, theme store, ThemeProvider, system preference detection, component theming, theme toggle UI, admin shell wiring, early-load script, transition CSS, and accessibility are all complete with passing tests.

The remaining work is Requirement 8: Admin Shell Inline Style Migration — replacing hardcoded hex color values in admin-shell view and modal components with CSS custom property references. This requires first adding new semantic status/action tokens to ui-lib tokens.css, then migrating each component.

## Tasks

- [x] 1. Shared design token definitions (UI_Lib)
  - tokens.css with light :root + dark [data-theme="dark"] semantic tokens
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Shared theme store hook (UI_Lib)
  - Nanostores atom, toggleTheme, localStorage persistence, system preference detection
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [x] 3. Shared ThemeProvider component (UI_Lib)
  - ThemeProvider with optional defaultTheme prop, exported from index.ts
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. System preference detection (UI_Lib)
  - prefers-color-scheme listener, manual toggle stops tracking
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. UI_Lib component theming
  - Navbar, Footer, UserMenu, LoginCard use semantic tokens
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. Theme toggle UI (Admin_Shell)
  - ProfileDropdown theme toggle with moon/sun icons, aria-label, role="menuitem", keyboard nav
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 7. Admin shell theme wiring
  - ThemeProvider wraps App in main.tsx, early-load script in index.html
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 8. UI_Lib tests
  - themeStore.test.ts (Property 1-4), useTheme.test.tsx, tokens.test.ts (Property 7), theme-response.test.tsx

- [x] 9. Admin shell theme tests
  - ThemeWiring.test.tsx (Property 5), ProfileDropdown.test.tsx (Property 6)

- [x] 10. Theme transition CSS
  - 200ms transition on background-color, color, border-color; prefers-reduced-motion: reduce to 0ms
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 11. Accessibility
  - aria-label on toggle, keyboard activation, role="menuitem"
  - _Requirements: 11.1, 11.4_

- [ ] 12. Add status and action semantic tokens to UI_Lib
  - [ ] 12.1 Add new semantic tokens to `@ugsys/ui-lib` `src/tokens/tokens.css`
    - Add the following tokens under both `:root` (light) and `[data-theme="dark"]` selectors:
      - `--color-success`, `--color-success-bg`, `--color-success-border`
      - `--color-warning`, `--color-warning-bg`, `--color-warning-border`
      - `--color-danger`, `--color-danger-bg`, `--color-danger-border`
      - `--color-info`, `--color-info-bg`, `--color-info-border`
      - `--color-muted-bg`, `--color-muted-border`
      - `--color-primary-action`, `--color-primary-action-text`
      - `--color-avatar-bg`, `--color-avatar-text`
      - `--color-active-indicator`
      - `--color-method-get`, `--color-method-post`, `--color-method-put`, `--color-method-patch`, `--color-method-delete`
      - `--color-method-badge-bg`
      - `--color-shimmer-start`, `--color-shimmer-mid`, `--color-shimmer-end`
    - Light values match existing hardcoded hex values; dark values provide appropriate contrast
    - _Requirements: 1.1, 1.4, 8.3_

  - [ ]* 12.2 Add token coverage tests for new status/action tokens
    - Extend `tests/tokens.test.ts` to verify all new tokens exist in both `:root` and `[data-theme="dark"]`
    - **Property 7 extension: Both themes define all semantic tokens (including new status/action tokens)**
    - **Validates: Requirements 1.1, 1.4**

- [ ] 13. Checkpoint - Verify new tokens
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Migrate HealthDashboard.tsx inline colors
  - [ ] 14.1 Replace hardcoded hex values in HealthDashboard.tsx with semantic tokens
    - Replace `STATUS_COLORS` object: `healthy` uses success tokens, `degraded` uses warning tokens, `unhealthy` uses danger tokens, `unknown` uses muted tokens
    - Replace retry button: `background: "#6366f1"` to `var(--color-primary-action)`, `color: "#fff"` to `var(--color-primary-action-text)`
    - _Requirements: 8.3_

  - [ ]* 14.2 Write unit tests for HealthDashboard theme token usage
    - Verify STATUS_COLORS references use `var(--color-*)` tokens instead of hardcoded hex
    - Verify retry button uses semantic tokens
    - _Requirements: 8.3_

- [ ] 15. Migrate UserManagement.tsx inline colors
  - [ ] 15.1 Replace hardcoded hex values in UserManagement.tsx with semantic tokens
    - Replace `retryBtnStyle` and RoleChangeModal save button: use `--color-primary-action` and `--color-primary-action-text`
    - Replace status badge colors in `UserRow`: active uses success tokens, inactive uses muted tokens
    - Replace avatar placeholder: `background: "#e0e7ff"` to `var(--color-avatar-bg)`, `color: "#4f46e5"` to `var(--color-avatar-text)`
    - Replace `actionBtnStyle()` hardcoded color params with semantic tokens (`--color-info`, `--color-primary-action`, `--color-danger`, `--color-success`)
    - Replace loading shimmer gradient with `var(--color-shimmer-start)`, `var(--color-shimmer-mid)`, `var(--color-shimmer-end)`
    - _Requirements: 8.3_

  - [ ]* 15.2 Write unit tests for UserManagement theme token usage
    - Verify buttons, badges, avatar, and shimmer use semantic tokens
    - _Requirements: 8.3_

- [ ] 16. Migrate AuditLog.tsx inline colors
  - [ ] 16.1 Replace hardcoded hex values in AuditLog.tsx with semantic tokens
    - Replace `statusColor()`: 5xx to `--color-danger`, 4xx to `--color-warning`, 3xx to `--color-info`, 2xx to `--color-success`
    - Replace `statusBg()`: 5xx to `--color-danger-bg`, 4xx to `--color-warning-bg`, 3xx to `--color-info-bg`, 2xx to `--color-success-bg`
    - Replace `methodColor()`: GET to `--color-method-get`, POST to `--color-method-post`, PUT to `--color-method-put`, PATCH to `--color-method-patch`, DELETE to `--color-method-delete`
    - Replace HTTP method badge `background: "#f0f9ff"` to `var(--color-method-badge-bg)`
    - Replace active sort header `color: "#4f46e5"` to `var(--color-active-indicator)`
    - Replace `retryBtnStyle` and Apply button with primary-action tokens
    - Replace loading shimmer gradient with shimmer tokens
    - _Requirements: 8.3_

  - [ ]* 16.2 Write unit tests for AuditLog theme token usage
    - Verify status, method, button, and shimmer colors use semantic tokens
    - _Requirements: 8.3_

- [ ] 17. Migrate ConfigForm.tsx inline colors
  - [ ] 17.1 Replace hardcoded hex values in ConfigForm.tsx with semantic tokens
    - Replace required asterisk `color: "#ef4444"` (3 occurrences in SchemaField) to `var(--color-danger)`
    - Replace success banner: `background: "#f0fdf4"` to `var(--color-success-bg)`, `border` to `var(--color-success-border)`, `color: "#15803d"` to `var(--color-success)`, dismiss button color to `var(--color-success)`
    - Replace `primaryBtnStyle`: `background: "#6366f1"` to `var(--color-primary-action)`, `color: "#fff"` to `var(--color-primary-action-text)`
    - _Requirements: 8.3_

  - [ ]* 17.2 Write unit tests for ConfigForm theme token usage
    - Verify asterisk, success banner, and primary button use semantic tokens
    - _Requirements: 8.3_

- [ ] 18. Checkpoint - Verify view component migrations
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Migrate EditProfileModal.tsx and SelfEditProfileModal.tsx inline colors
  - [ ] 19.1 Replace hardcoded hex values in EditProfileModal.tsx with semantic tokens
    - Replace TabButton active indicator: `borderBottom: "2px solid #6366f1"` to `var(--color-active-indicator)`, `color: "#6366f1"` to `var(--color-active-indicator)`
    - Replace Save button: `color: "#fff"` to `var(--color-primary-action-text)`
    - _Requirements: 8.2_

  - [ ] 19.2 Replace hardcoded hex values in SelfEditProfileModal.tsx with semantic tokens
    - Replace Save button: `color: "#fff"` to `var(--color-primary-action-text)`
    - _Requirements: 8.2_

  - [ ]* 19.3 Write unit tests for modal theme token usage
    - Verify EditProfileModal tab indicator and save button use semantic tokens
    - Verify SelfEditProfileModal save button uses semantic tokens
    - _Requirements: 8.2_

- [ ] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks 1-11 are already complete and marked as [x]
- Tasks marked with * are optional test sub-tasks and can be skipped for faster MVP
- The migration strategy is: add tokens first (task 12), then migrate components (tasks 14-19)
- Each component migration is independent and can be done in any order after tokens are added
- All new tokens need both light and dark values with appropriate contrast
- Existing tests (286 passing in admin-shell, plus ui-lib suite) must continue to pass after each migration
- Run tests with `npx vitest run` inside the appropriate repo directory
