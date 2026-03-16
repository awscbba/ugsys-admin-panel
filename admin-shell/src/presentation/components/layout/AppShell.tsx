import { useEffect } from "react";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import { useStore } from "@nanostores/react";
import {
  $user,
  $isAuthenticated,
  $isLoading,
  logout,
  initializeAuth,
} from "../../../stores/authStore";
import { $services, loadServices } from "../../../stores/registryStore";
import type { NavigationEntry } from "../../../domain/entities/ServiceRegistration";
import { Breadcrumb } from "./Breadcrumb";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useSectionTitle } from "../../hooks/useSectionTitle";

/**
 * AppShell — main layout component.
 *
 * - Shows a login form when no valid session exists (Req 1.1)
 * - Shows Sidebar + TopBar + content area (via Outlet) when authenticated (Req 1.2)
 * - Initializes auth session on mount
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
export function AppShell() {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  const services = useStore($services);
  const location = useLocation();
  const sectionTitle = useSectionTitle();
  const showBreadcrumb =
    location.pathname.startsWith("/config/") ||
    location.pathname.startsWith("/app/");

  // Restore session on mount
  useEffect(() => {
    initializeAuth();
  }, []);

  // Load services once authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadServices().catch(() => {
        // Non-fatal — sidebar will be empty but the shell still renders
      });
    }
  }, [isAuthenticated]);

  // Collect all navigation entries from registered services,
  // then append synthetic "Configuration" entries for services that
  // expose a config schema (admin/super_admin only).
  const navigationEntries: NavigationEntry[] = [
    ...services.flatMap((svc) => svc.manifest?.navigation ?? []),
    ...services
      .filter((svc) => svc.hasConfigSchema)
      .map(
        (svc): NavigationEntry => ({
          label: svc.serviceName,
          icon: "⚙️",
          path: `/config/${svc.serviceName}`,
          requiredRoles: ["admin", "super_admin"],
          group: "Configuration",
          order: 0,
        }),
      ),
  ];

  const userRoles = user?.roles ?? [];

  // ── Loading splash ────────────────────────────────────────────────────

  if (isLoading && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-base text-gray-500 bg-primary font-sans">
        Loading…
      </div>
    );
  }

  // ── Login redirect ────────────────────────────────────────────────────

  if (!isAuthenticated) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  // ── Authenticated layout ──────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar navigationEntries={navigationEntries} userRoles={userRoles} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <TopBar user={user!} onLogout={logout} />

        <main
          style={{
            flex: 1,
            overflow: "auto",
            padding: "24px",
            background: "#f9fafb",
          }}
        >
          {showBreadcrumb && <Breadcrumb currentTitle={sectionTitle} />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
