/**
 * Unit tests for buildCsp — the runtime CSP meta tag builder.
 *
 * These tests verify that the generated CSP string:
 *   1. Always includes the shell origin in script-src
 *   2. Adds micro-frontend origins to script-src
 *   3. Deduplicates origins
 *   4. Includes 'unsafe-inline' in style-src (required by UI lib)
 *   5. Includes data: in font-src (required by @ugsys/ui-lib base64 fonts)
 *   6. Never includes 'unsafe-eval'
 */
import { describe, it, expect } from "vitest";
import { buildCsp } from "./App";

describe("buildCsp", () => {
  it("includes shell origin in script-src with no extra origins", () => {
    const csp = buildCsp([]);
    expect(csp).toContain(
      "script-src 'self' https://admin.apps.cloud.org.bo",
    );
  });

  it("adds micro-frontend origins to script-src", () => {
    const csp = buildCsp(["https://registry.apps.cloud.org.bo"]);
    expect(csp).toContain("https://registry.apps.cloud.org.bo");
  });

  it("deduplicates origins when shell origin is passed again", () => {
    const csp = buildCsp([
      "https://admin.apps.cloud.org.bo",
      "https://admin.apps.cloud.org.bo",
    ]);
    const scriptSrcMatch = csp.match(/script-src ([^;]+)/);
    const scriptSrc = scriptSrcMatch?.[1] ?? "";
    const origins = scriptSrc.trim().split(/\s+/);
    const unique = new Set(origins);
    expect(unique.size).toBe(origins.length);
  });

  it("includes 'unsafe-inline' in style-src for UI lib compatibility", () => {
    const csp = buildCsp([]);
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("includes data: in font-src for base64-embedded fonts", () => {
    const csp = buildCsp([]);
    expect(csp).toContain("font-src 'self' data:");
  });

  it("never includes 'unsafe-eval'", () => {
    const csp = buildCsp(["https://some-mfe.apps.cloud.org.bo"]);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("always includes frame-ancestors 'none'", () => {
    const csp = buildCsp([]);
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
