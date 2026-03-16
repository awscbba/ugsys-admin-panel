/**
 * Tests for Sidebar component — Dashboard link.
 * Requirements: 1.1–1.7 — Dashboard link always first, active styling, aria-current
 * Requirements: 4.7 — aria-current="page" when active
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import type { NavigationEntry } from "../../../domain/entities/ServiceRegistration";

const mockEntries: NavigationEntry[] = [
  {
    label: "Users",
    icon: "👥",
    path: "/users",
    requiredRoles: ["admin"],
    group: "Management",
    order: 1,
  },
  {
    label: "Audit",
    icon: "📋",
    path: "/audit",
    requiredRoles: ["admin"],
    group: "Management",
    order: 2,
  },
];

function renderSidebar(
  pathname: string,
  entries: NavigationEntry[] = mockEntries,
  userRoles: string[] = ["admin"],
) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Sidebar navigationEntries={entries} userRoles={userRoles} />
    </MemoryRouter>,
  );
}

describe("Sidebar — Dashboard Link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Requirement 1.1: Dashboard link is first item ──────────────────────────

  it("renders Dashboard link as the first navigation item", () => {
    renderSidebar("/users");
    const nav = screen.getByRole("navigation", { name: /sidebar/i });
    const allLinks = within(nav).getAllByRole("link");

    // Dashboard should be the first link
    expect(allLinks[0]).toHaveTextContent("Dashboard");
    expect(allLinks[0]).toHaveAttribute("href", "/dashboard");
  });

  it("renders Dashboard link before service-registry-derived entries", () => {
    renderSidebar("/users");
    const nav = screen.getByRole("navigation", { name: /sidebar/i });
    const allLinks = within(nav).getAllByRole("link");

    // Order: Dashboard, Users, Audit
    expect(allLinks[0]).toHaveTextContent("Dashboard");
    expect(allLinks[1]).toHaveTextContent("Users");
    expect(allLinks[2]).toHaveTextContent("Audit");
  });

  // ── Requirement 1.6, 1.7: Dashboard link visible with empty registry ───────

  it("renders Dashboard link when service registry is empty", () => {
    renderSidebar("/dashboard", []);
    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
  });

  it("renders Dashboard link as sole navigation item when registry is empty", () => {
    renderSidebar("/dashboard", []);
    const nav = screen.getByRole("navigation", { name: /sidebar/i });
    const allLinks = within(nav).getAllByRole("link");
    expect(allLinks).toHaveLength(1);
    expect(allLinks[0]).toHaveTextContent("Dashboard");
  });

  // ── Requirement 4.7: aria-current="page" when active ───────────────────────

  it("has aria-current='page' when pathname is /dashboard", () => {
    renderSidebar("/dashboard");
    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).toHaveAttribute("aria-current", "page");
  });

  it("does NOT have aria-current when pathname is different", () => {
    renderSidebar("/users");
    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).not.toHaveAttribute("aria-current");
  });

  it("does NOT have aria-current when on a nested route", () => {
    renderSidebar("/app/identity-manager/users");
    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).not.toHaveAttribute("aria-current");
  });

  // ── NavLink usage (client-side navigation) ─────────────────────────────────

  it("Dashboard link uses NavLink for client-side navigation", () => {
    renderSidebar("/users");
    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });

    // NavLink renders as <a> with href — verify it's a proper link
    expect(dashboardLink.tagName).toBe("A");
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");

    // Should NOT have target="_blank" or rel="external" (would indicate external link)
    expect(dashboardLink).not.toHaveAttribute("target");
    expect(dashboardLink).not.toHaveAttribute("rel");
  });

  // ── Requirement 1.3: Visible to all authenticated users ────────────────────

  it("renders Dashboard link regardless of user roles", () => {
    renderSidebar("/dashboard", mockEntries, ["viewer"]);
    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).toBeInTheDocument();
  });

  // ── Icon rendering ─────────────────────────────────────────────────────────

  it("renders 🏠 emoji as the Dashboard icon", () => {
    renderSidebar("/dashboard");
    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).toHaveTextContent("🏠");
  });
});
