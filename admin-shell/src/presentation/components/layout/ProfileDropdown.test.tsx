/**
 * Tests for ProfileDropdown component.
 * Requirements: 6.2 — ARIA menu, click-outside, Escape, arrow key navigation
 * Requirements: 6.1, 6.2, 6.3, 6.4, 11.1, 11.4 — Theme toggle
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as fc from "fast-check";
import { createRef } from "react";
import { ProfileDropdown } from "./ProfileDropdown";

// Mock @ugsys/ui-lib useTheme hook
const mockToggleTheme = vi.fn();
let mockTheme: "light" | "dark" = "light";

vi.mock("@ugsys/ui-lib", () => ({
  useTheme: () => ({ theme: mockTheme, toggleTheme: mockToggleTheme }),
}));

function renderDropdown(overrides?: {
  onClose?: () => void;
  onEditProfile?: () => void;
  onLogout?: () => void;
}) {
  const triggerRef = createRef<HTMLButtonElement>();
  const onClose = overrides?.onClose ?? vi.fn();
  const onEditProfile = overrides?.onEditProfile ?? vi.fn();
  const onLogout = overrides?.onLogout ?? vi.fn();

  // Render a trigger button so triggerRef is attached to a real DOM node
  const { unmount } = render(
    <>
      <button ref={triggerRef as React.RefObject<HTMLButtonElement>}>
        Trigger
      </button>
      <ProfileDropdown
        triggerRef={triggerRef as React.RefObject<HTMLButtonElement | null>}
        onClose={onClose}
        onEditProfile={onEditProfile}
        onLogout={onLogout}
      />
    </>,
  );

  return { triggerRef, onClose, onEditProfile, onLogout, unmount };
}

describe("ProfileDropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = "light";
  });

  it("renders three menu items: Edit Profile, theme toggle, Logout", () => {
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Edit Profile");
    // items[1] is theme toggle
    expect(items[2]).toHaveTextContent("Logout");
  });

  it("has role=menu on the container", () => {
    renderDropdown();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("calls onEditProfile when Edit Profile is clicked", async () => {
    const onEditProfile = vi.fn();
    renderDropdown({ onEditProfile });
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Edit Profile" }),
    );
    expect(onEditProfile).toHaveBeenCalledOnce();
  });

  it("calls onLogout when Logout is clicked", async () => {
    const onLogout = vi.fn();
    renderDropdown({ onLogout });
    await userEvent.click(screen.getByRole("menuitem", { name: "Logout" }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking outside the menu", () => {
    const onClose = vi.fn();
    renderDropdown({ onClose });
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does NOT call onClose when clicking inside the menu", async () => {
    const onClose = vi.fn();
    renderDropdown({ onClose });
    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on Escape key and returns focus to trigger", () => {
    const onClose = vi.fn();
    const { triggerRef } = renderDropdown({ onClose });
    const focusSpy = vi.spyOn(triggerRef.current!, "focus");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(focusSpy).toHaveBeenCalledOnce();
  });

  it("ArrowDown moves focus to next item (wraps)", () => {
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    items[2]!.focus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("ArrowUp moves focus to previous item (wraps)", () => {
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    items[0]!.focus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[2]);
  });

  // ── Theme toggle tests ──────────────────────────────────────────────────

  it("theme toggle renders before Logout item", () => {
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    // Edit Profile, Theme Toggle, Logout
    expect(items[1]).toHaveTextContent(/Dark|Light/);
    expect(items[2]).toHaveTextContent("Logout");
  });

  it("theme toggle shows moon icon and 'Dark' label when theme is light", () => {
    mockTheme = "light";
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    expect(items[1]).toHaveTextContent("Dark");
    expect(items[1]).toHaveAttribute("aria-label", "Switch to dark theme");
  });

  it("theme toggle shows sun icon and 'Light' label when theme is dark", () => {
    mockTheme = "dark";
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    expect(items[1]).toHaveTextContent("Light");
    expect(items[1]).toHaveAttribute("aria-label", "Switch to light theme");
  });

  it("theme toggle click calls toggleTheme", async () => {
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    await userEvent.click(items[1]);
    expect(mockToggleTheme).toHaveBeenCalledOnce();
  });

  it("theme toggle has role=menuitem", () => {
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    expect(items[1]).toHaveAttribute("role", "menuitem");
  });

  it("theme toggle activates via Enter key", async () => {
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    items[1]!.focus();
    await userEvent.keyboard("{Enter}");
    expect(mockToggleTheme).toHaveBeenCalledOnce();
  });

  it("theme toggle activates via Space key", async () => {
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    items[1]!.focus();
    await userEvent.keyboard(" ");
    expect(mockToggleTheme).toHaveBeenCalledOnce();
  });

  it("theme toggle participates in ArrowDown navigation", () => {
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    items[0]!.focus(); // Edit Profile
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]); // Theme toggle
  });

  it("theme toggle participates in ArrowUp navigation", () => {
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    items[2]!.focus(); // Logout
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[1]); // Theme toggle
  });

  // ── Property 6: Toggle label and aria-label reflect current theme ───────

  it("Property 6: toggle label and aria-label reflect current theme", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("light" as const, "dark" as const),
        (theme) => {
          mockTheme = theme;
          const { unmount } = render(
            <>
              <button
                ref={
                  createRef<HTMLButtonElement>() as React.RefObject<HTMLButtonElement>
                }
              >
                Trigger
              </button>
              <ProfileDropdown
                triggerRef={
                  createRef<HTMLButtonElement>() as React.RefObject<HTMLButtonElement | null>
                }
                onClose={() => {}}
                onEditProfile={() => {}}
                onLogout={() => {}}
              />
            </>,
          );

          const items = screen.getAllByRole("menuitem");
          const toggleItem = items[1];

          if (theme === "light") {
            expect(toggleItem).toHaveTextContent("Dark");
            expect(toggleItem).toHaveAttribute(
              "aria-label",
              "Switch to dark theme",
            );
          } else {
            expect(toggleItem).toHaveTextContent("Light");
            expect(toggleItem).toHaveAttribute(
              "aria-label",
              "Switch to light theme",
            );
          }

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});
