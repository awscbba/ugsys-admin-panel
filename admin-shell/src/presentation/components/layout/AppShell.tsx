import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useStore } from "@nanostores/react";
import {
  $user,
  $isAuthenticated,
  $isLoading,
  login,
  logout,
  initializeAuth,
} from "../../../stores/authStore";
import { $services, loadServices } from "../../../stores/registryStore";
import type { NavigationEntry } from "../../../domain/entities/ServiceRegistration";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontSize: "16px",
          color: "#6b7280",
        }}
      >
        Loading…
      </div>
    );
  }

  // ── Login screen ──────────────────────────────────────────────────────

  if (!isAuthenticated) {
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginError(null);
      try {
        await login(email, password);
      } catch (err) {
        setLoginError(err instanceof Error ? err.message : "Login failed");
      }
    };

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#f9fafb",
        }}
      >
        <form
          onSubmit={handleSubmit}
          aria-label="Login form"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            padding: "40px",
            background: "#fff",
            borderRadius: "12px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            width: "360px",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "22px",
              fontWeight: 700,
              color: "#111827",
            }}
          >
            Admin Panel
          </h1>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              fontSize: "14px",
            }}
          >
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            />
          </label>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              fontSize: "14px",
            }}
          >
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            />
          </label>

          {loginError && (
            <p
              role="alert"
              style={{ margin: 0, fontSize: "13px", color: "#dc2626" }}
            >
              {loginError}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: "10px",
              background: "#6366f1",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );
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
