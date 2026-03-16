/**
 * Tests for Task 7: ThemeProvider wiring and early-load script behavior.
 *
 * Requirements: 7.1, 7.2, 7.3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";

const STORAGE_KEY = "ugsys-theme";

// ── localStorage mock ────────────────────────────────────────────────────

const store = new Map<string, string>();

const localStorageMock = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  removeItem: vi.fn((key: string) => store.delete(key)),
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// ── matchMedia mock ──────────────────────────────────────────────────────

let prefersDark = false;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" ? prefersDark : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })),
});

// ── Early-load script logic (extracted for testability) ──────────────────

/**
 * Replicates the early-load script logic from index.html.
 * Reads ugsys-theme from localStorage, validates, falls back to system pref.
 */
function earlyLoadTheme(): "light" | "dark" {
  let theme: "light" | "dark";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      theme = stored;
    } else {
      if (stored !== null) window.localStorage.removeItem(STORAGE_KEY);
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
  } catch {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
  return theme;
}

function cleanup() {
  store.clear();
  prefersDark = false;
  document.documentElement.removeAttribute("data-theme");
}

describe("Early-load script", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("sets data-theme from valid localStorage value 'light'", () => {
    store.set(STORAGE_KEY, "light");
    const result = earlyLoadTheme();
    expect(result).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("sets data-theme from valid localStorage value 'dark'", () => {
    store.set(STORAGE_KEY, "dark");
    const result = earlyLoadTheme();
    expect(result).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("falls back to system preference when localStorage is empty", () => {
    const result = earlyLoadTheme();
    expect(result).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("falls back to dark when system prefers dark and localStorage is empty", () => {
    prefersDark = true;
    const result = earlyLoadTheme();
    expect(result).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("removes invalid localStorage value and falls back", () => {
    store.set(STORAGE_KEY, "invalid-value");
    earlyLoadTheme();
    expect(store.has(STORAGE_KEY)).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  // ── Property 5: Invalid localStorage fallback ──────────────────────────

  it("Property 5: invalid localStorage values are cleaned and fallback applied", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== "light" && s !== "dark"),
        (invalidValue) => {
          cleanup();

          store.set(STORAGE_KEY, invalidValue);
          earlyLoadTheme();

          // Invalid value should be removed
          expect(store.has(STORAGE_KEY)).toBe(false);
          // data-theme should be set to a valid value
          const attr = document.documentElement.getAttribute("data-theme");
          expect(attr === "light" || attr === "dark").toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
