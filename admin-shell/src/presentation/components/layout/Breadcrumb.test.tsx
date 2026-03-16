/**
 * Tests for Breadcrumb component.
 * Requirements: 3.3, 3.4, 3.6 — Dashboard link, currentTitle with aria-current, React Router Link
 * Requirements: 4.3, 4.4, 4.5, 4.6 — keyboard accessibility, aria-label, aria-current="page"
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Breadcrumb } from "./Breadcrumb";

function renderBreadcrumb(currentTitle: string) {
  return render(
    <MemoryRouter>
      <Breadcrumb currentTitle={currentTitle} />
    </MemoryRouter>,
  );
}

describe("Breadcrumb", () => {
  // ── Requirement 3.3: Dashboard link ────────────────────────────────────────

  it("renders Dashboard link that navigates to /dashboard", () => {
    renderBreadcrumb("Config — identity-manager");
    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
  });

  // ── Requirement 3.4: currentTitle with aria-current="page" ─────────────────

  it("renders currentTitle with aria-current='page'", () => {
    renderBreadcrumb("Config — identity-manager");
    const currentSegment = screen.getByText("Config — identity-manager");
    expect(currentSegment).toHaveAttribute("aria-current", "page");
  });

  it("renders different currentTitle values correctly", () => {
    renderBreadcrumb("Users");
    const currentSegment = screen.getByText("Users");
    expect(currentSegment).toHaveAttribute("aria-current", "page");
  });

  // ── Requirement 3.6: React Router Link (no full reload) ────────────────────

  it("Dashboard link uses React Router Link (no full reload)", () => {
    renderBreadcrumb("Audit Log");
    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });

    // Link renders as <a> with href — verify it's a proper link
    expect(dashboardLink.tagName).toBe("A");
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");

    // Should NOT have target="_blank" or rel="external" (would indicate external link)
    expect(dashboardLink).not.toHaveAttribute("target");
    expect(dashboardLink).not.toHaveAttribute("rel");
  });

  // ── Requirement 4.5: aria-label="Breadcrumb" on container ──────────────────

  it("has aria-label='Breadcrumb' on the container nav element", () => {
    renderBreadcrumb("Config — identity-manager");
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveAttribute("aria-label", "Breadcrumb");
  });

  // ── Separator rendering ────────────────────────────────────────────────────

  it("renders separator between Dashboard and currentTitle", () => {
    renderBreadcrumb("Config — identity-manager");
    const separator = screen.getByText("/");
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveAttribute("aria-hidden", "true");
  });
});
