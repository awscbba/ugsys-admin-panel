/**
 * useSectionTitle.test.ts — unit tests for the useSectionTitle hook.
 *
 * Tests route-to-title mapping for all route patterns:
 *   /dashboard → "Dashboard"
 *   /users → "Users"
 *   /audit → "Audit Log"
 *   /config/:serviceName → "Config — {serviceName}"
 *   /app/:serviceName/* → manifest label or serviceName fallback
 *   unmatched → ""
 *
 * Requirements: 2.1–2.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ReactNode } from "react";
import { useSectionTitle } from "./useSectionTitle";
import { $services } from "../../stores/registryStore";
import type { ServiceRegistration } from "../../domain/entities/ServiceRegistration";

// Helper to create a wrapper with MemoryRouter at a specific path
function createWrapper(initialPath: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/dashboard" element={children} />
          <Route path="/users" element={children} />
          <Route path="/audit" element={children} />
          <Route path="/config/:serviceName" element={children} />
          <Route path="/app/:serviceName/*" element={children} />
          <Route path="*" element={children} />
        </Routes>
      </MemoryRouter>
    );
  };
}

// Mock service registration factory
function createMockService(
  serviceName: string,
  navigationLabel?: string,
): ServiceRegistration {
  return {
    serviceName,
    baseUrl: `https://${serviceName}.example.com`,
    healthEndpoint: "/health",
    manifestUrl: "/manifest.json",
    manifest: navigationLabel
      ? {
          name: serviceName,
          version: "1.0.0",
          entryPoint: `https://${serviceName}.example.com/entry.js`,
          routes: [],
          navigation: [
            {
              label: navigationLabel,
              icon: "📦",
              path: `/app/${serviceName}`,
              requiredRoles: ["admin"],
            },
          ],
        }
      : null,
    minRole: "admin",
    status: "active",
    version: 1,
    registeredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    registeredBy: "test",
    registrationSource: "seed",
    hasConfigSchema: false,
  };
}

describe("useSectionTitle", () => {
  beforeEach(() => {
    // Reset the services store before each test
    $services.set([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Built-in routes ─────────────────────────────────────────────────────

  it('returns "Dashboard" for /dashboard route', () => {
    const { result } = renderHook(() => useSectionTitle(), {
      wrapper: createWrapper("/dashboard"),
    });
    expect(result.current).toBe("Dashboard");
  });

  it('returns "Users" for /users route', () => {
    const { result } = renderHook(() => useSectionTitle(), {
      wrapper: createWrapper("/users"),
    });
    expect(result.current).toBe("Users");
  });

  it('returns "Audit Log" for /audit route', () => {
    const { result } = renderHook(() => useSectionTitle(), {
      wrapper: createWrapper("/audit"),
    });
    expect(result.current).toBe("Audit Log");
  });

  // ── Config routes ───────────────────────────────────────────────────────

  it('returns "Config — {serviceName}" for /config/:serviceName route', () => {
    const { result } = renderHook(() => useSectionTitle(), {
      wrapper: createWrapper("/config/identity-manager"),
    });
    expect(result.current).toBe("Config — identity-manager");
  });

  it("handles different service names in config route", () => {
    const { result } = renderHook(() => useSectionTitle(), {
      wrapper: createWrapper("/config/user-profile-service"),
    });
    expect(result.current).toBe("Config — user-profile-service");
  });

  // ── App routes with registry label ──────────────────────────────────────

  it("returns manifest navigation label for /app/:serviceName/* when available", () => {
    $services.set([createMockService("projects-registry", "Projects")]);

    const { result } = renderHook(() => useSectionTitle(), {
      wrapper: createWrapper("/app/projects-registry/dashboard"),
    });
    expect(result.current).toBe("Projects");
  });

  it("returns serviceName fallback when manifest has no navigation label", () => {
    $services.set([createMockService("projects-registry")]);

    const { result } = renderHook(() => useSectionTitle(), {
      wrapper: createWrapper("/app/projects-registry/dashboard"),
    });
    expect(result.current).toBe("projects-registry");
  });

  it("returns serviceName fallback when service is not in registry", () => {
    $services.set([]); // Empty registry

    const { result } = renderHook(() => useSectionTitle(), {
      wrapper: createWrapper("/app/unknown-service/page"),
    });
    expect(result.current).toBe("unknown-service");
  });

  it("handles nested sub-paths in /app/:serviceName/* route", () => {
    $services.set([createMockService("user-profile", "User Profile")]);

    const { result } = renderHook(() => useSectionTitle(), {
      wrapper: createWrapper("/app/user-profile/settings/preferences"),
    });
    expect(result.current).toBe("User Profile");
  });

  // ── Unmatched routes ────────────────────────────────────────────────────

  it("returns empty string for unmatched routes", () => {
    const { result } = renderHook(() => useSectionTitle(), {
      wrapper: createWrapper("/some/unknown/path"),
    });
    expect(result.current).toBe("");
  });

  it("returns empty string for root path", () => {
    const { result } = renderHook(() => useSectionTitle(), {
      wrapper: createWrapper("/"),
    });
    expect(result.current).toBe("");
  });
});
