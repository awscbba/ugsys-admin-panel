/**
 * Tests for ProfileDropdown component.
 * Requirements: 6.2 — ARIA menu, click-outside, Escape, arrow key navigation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { ProfileDropdown } from "./ProfileDropdown";

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
      <button ref={triggerRef as React.RefObject<HTMLButtonElement>}>Trigger</button>
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
  });

  it("renders two menu items", () => {
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Edit Profile");
    expect(items[1]).toHaveTextContent("Logout");
  });

  it("has role=menu on the container", () => {
    renderDropdown();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("calls onEditProfile when Edit Profile is clicked", async () => {
    const onEditProfile = vi.fn();
    renderDropdown({ onEditProfile });
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit Profile" }));
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
    items[1]!.focus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("ArrowUp moves focus to previous item (wraps)", () => {
    renderDropdown();
    const items = screen.getAllByRole("menuitem");
    items[0]!.focus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[1]);
  });
});
