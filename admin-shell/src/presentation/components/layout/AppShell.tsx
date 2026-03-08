import { useEffect } from "react";
import { Outlet } from "react-router-dom";
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
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { LoginPage } from "../views/LoginPage";

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

  // Collect all navigation entries from registered services
  const navigationEntries: NavigationEntry[] = services.flatMap(
    (svc) => svc.manifest?.navigation ?? [],
  );

  const userRoles = user?.roles ?? [];

  // ── Loading splash ────────────────────────────────────────────────────

  if (isLoading && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-base text-gray-500 bg-primary font-sans">
        Loading…
      </div>
    );
  }

  // ── Login screen ──────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return <LoginPage />;
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
