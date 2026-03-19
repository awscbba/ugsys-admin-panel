/**
 * App — root component wiring React Router, RBAC, ErrorBoundary, and CSP.
 *
 * Routes:
 *   /              → redirect to /dashboard
 *   /dashboard     → HealthDashboard
 *   /users         → UserManagement
 *   /audit         → AuditLog
 *   /config/:serviceName → ConfigForm
 *   /app/:serviceName/*  → MicroFrontendLoader (dynamic micro-frontend)
 *
 * CSP (Req 6.6, 13.6):
 *   A <meta http-equiv="Content-Security-Policy"> tag is injected into
 *   <head> at runtime, derived from the registered service entryPoints.
 *   script-src = 'self' + one origin per registered entryPoint URL.
 *   unsafe-inline and unsafe-eval are explicitly excluded.
 *
 * Requirements: 1.5, 6.6, 13.6
 */

import React, { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useStore } from "@nanostores/react";

import { AppShell } from "./presentation/components/layout/AppShell";
import { LoginPage } from "./presentation/components/views/LoginPage";
import { HealthDashboard } from "./presentation/components/views/HealthDashboard";
import { UserManagement } from "./presentation/components/views/UserManagement";
import { AuditLog } from "./presentation/components/views/AuditLog";
import { ConfigForm } from "./presentation/components/views/ConfigForm";
import { MicroFrontendLoader } from "./presentation/components/MicroFrontendLoader";
import { ErrorBoundary } from "./presentation/components/ErrorBoundary";
import { RbacProvider } from "./presentation/components/RbacProvider";
import { SessionMonitor } from "./presentation/components/SessionMonitor";

import { $user, $isAuthenticated, logout } from "./stores/authStore";
import { $services } from "./stores/registryStore";
import { HttpAuthRepository } from "./infrastructure/repositories/HttpAuthRepository";

// ── CSP helpers ───────────────────────────────────────────────────────────────

const SHELL_ORIGIN = "https://admin.apps.cloud.org.bo";

/**
 * Known plugin host origins that must be in script-src from the start.
 * These are the origins from which micro-frontend bundles are served.
 * The CspInjector also adds entryPoint origins dynamically, but the initial
 * CSP is applied before manifests are fetched — so known hosts must be
 * listed here to avoid blocking the first script load.
 */
const KNOWN_PLUGIN_ORIGINS = [
  "https://api.apps.cloud.org.bo", // projects-registry API
  "https://registry.apps.cloud.org.bo", // projects-registry plugin bundle
  "https://auth.apps.cloud.org.bo", // identity-manager plugin
  "https://profiles.apps.cloud.org.bo", // user-profile-service plugin
];

/** Extracts the scheme+host origin from a URL string. Returns null on parse failure. */
function extractOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Builds the CSP string from the set of registered entryPoint origins.
 * script-src: 'self' + each unique entryPoint origin.
 * unsafe-eval is intentionally omitted (Req 13.6).
 * unsafe-inline is required for style-src (UI lib embeds inline styles).
 *
 * Exported for unit testing only.
 */
export function buildCsp(entryPointOrigins: string[]): string {
  const uniqueOrigins = Array.from(
    new Set([SHELL_ORIGIN, ...KNOWN_PLUGIN_ORIGINS, ...entryPointOrigins]),
  );
  const scriptSrc = ["'self'", ...uniqueOrigins].join(" ");

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // 'unsafe-inline' required: UI component libraries embed inline styles.
    // This matches the CloudFront response headers policy intentionally.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https:`,
    // data: required: @ugsys/ui-lib CSS bundle embeds base64-encoded fonts.
    `font-src 'self' data:`,
    // Allow XHR/fetch to the BFF and to micro-frontend service APIs.
    `connect-src 'self' https://api.apps.cloud.org.bo https://registry.apps.cloud.org.bo https://auth.apps.cloud.org.bo https://profiles.apps.cloud.org.bo`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join("; ");
}

/** Injects or updates the CSP <meta> tag in <head>. */
function applyCspMeta(csp: string): void {
  const META_ID = "csp-meta";
  let meta = document.getElementById(META_ID) as HTMLMetaElement | null;

  if (!meta) {
    meta = document.createElement("meta");
    meta.id = META_ID;
    meta.httpEquiv = "Content-Security-Policy";
    document.head.appendChild(meta);
  }

  meta.content = csp;
}

// ── CSP injector component ────────────────────────────────────────────────────

/**
 * Reads $services, extracts entryPoint origins, and keeps the CSP meta tag
 * in sync whenever the service registry changes.
 */
function CspInjector(): null {
  const services = useStore($services);

  useEffect(() => {
    const origins = services
      .map((svc) => svc.manifest?.entryPoint)
      .filter((ep): ep is string => Boolean(ep))
      .map(extractOrigin)
      .filter((o): o is string => o !== null);

    applyCspMeta(buildCsp(origins));
  }, [services]);

  return null;
}

// ── ConfigForm route adapter ──────────────────────────────────────────────────

/** Extracts :serviceName from the URL and passes it to ConfigForm. */
function ConfigFormRoute(): React.ReactElement {
  const { serviceName = "" } = useParams<{ serviceName: string }>();
  return <ConfigForm serviceName={serviceName} />;
}

// ── MicroFrontend route ───────────────────────────────────────────────────────

/**
 * Resolves the service from the registry by :serviceName param and renders
 * MicroFrontendLoader with the correct entryPoint and user context.
 */
function MicroFrontendRoute(): React.ReactElement {
  const { serviceName = "" } = useParams<{ serviceName: string }>();
  const services = useStore($services);
  const user = useStore($user);

  const service = services.find((s) => s.serviceName === serviceName);

  if (!service?.manifest?.entryPoint) {
    return (
      <div role="alert" style={{ padding: "1.5rem", color: "#991b1b" }}>
        Service <strong>{serviceName}</strong> not found or has no entry point.
      </div>
    );
  }

  const context = {
    userId: user?.userId ?? "",
    roles: user?.roles ?? [],
    displayName: user?.displayName ?? "",
    // Access token is managed server-side via httpOnly cookie; expose a no-op
    // accessor so micro-frontends that need it can call it without crashing.
    getAccessToken: () => null,
  };

  return (
    <MicroFrontendLoader
      entryPoint={service.manifest.entryPoint}
      serviceName={serviceName}
      context={context}
    />
  );
}

// ── Session monitor wiring ────────────────────────────────────────────────────

/** Lazy singleton for the auth repo used by the session monitor. */
let _authRepo: HttpAuthRepository | null = null;
function getAuthRepo(): HttpAuthRepository {
  if (!_authRepo) _authRepo = new HttpAuthRepository();
  return _authRepo;
}

/**
 * Reads the token expiry from the BFF /api/v1/auth/me response.
 * The BFF stores the expiry in a non-httpOnly cookie named `token_expiry`
 * so the shell can read it without touching the access token itself.
 * Falls back to null if the cookie is absent.
 */
function getTokenExpiry(): number | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("token_expiry="));
  if (!match) return null;
  const value = match.split("=")[1];
  const parsed = parseInt(value ?? "", 10);
  return isNaN(parsed) ? null : parsed;
}

async function handleRefresh(): Promise<void> {
  await getAuthRepo().refresh();
}

async function handleSessionExpired(): Promise<void> {
  await logout();
}

// ── Login route ───────────────────────────────────────────────────────────────

/**
 * Renders LoginPage for unauthenticated users.
 * Redirects to `?redirect` param (or /dashboard) when already authenticated.
 * Requirements: 3.1, 3.3, 3.7
 */
function LoginRoute(): React.ReactElement {
  const isAuthenticated = useStore($isAuthenticated);
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  if (isAuthenticated) return <Navigate to={redirect} replace />;
  return <LoginPage />;
}

// ── App ───────────────────────────────────────────────────────────────────────

export function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <ErrorBoundary name="app-root">
        <RbacProvider>
          {/* Keep CSP meta in sync with registered services */}
          <CspInjector />

          {/* Session expiry monitor */}
          <SessionMonitor
            getTokenExpiry={getTokenExpiry}
            onRefresh={handleRefresh}
            onSessionExpired={handleSessionExpired}
          />

          <Routes>
            {/* Public login route — outside AppShell (no auth required) */}
            <Route path="login" element={<LoginRoute />} />

            {/* AppShell provides the authenticated layout (sidebar + topbar + Outlet) */}
            <Route element={<AppShell />}>
              {/* Default redirect */}
              <Route index element={<Navigate to="/dashboard" replace />} />

              {/* Built-in views */}
              <Route path="dashboard" element={<HealthDashboard />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="audit" element={<AuditLog />} />
              <Route path="config/:serviceName" element={<ConfigFormRoute />} />

              {/* Dynamic micro-frontend routes */}
              <Route
                path="app/:serviceName/*"
                element={<MicroFrontendRoute />}
              />
            </Route>
          </Routes>
        </RbacProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
