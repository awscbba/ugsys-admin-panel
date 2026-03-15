/**
 * Tests for TopBar component.
 * Requirements: 8.1, 8.2 — avatar trigger, dropdown, modal, initials, avatar img
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminUser } from "../../../domain/entities/AdminUser";
import { TopBar } from "./TopBar";

// Mock child components to isolate TopBar logic
vi.mock("./ProfileDropdown", () => ({
  ProfileDropdown: ({ onClose, onEditProfile, onLogout }: {
    onClose: () => void;
    onEditProfile: () => void;
    onLogout: () => void;
  }) => (
    <div data-testid="profile-dropdown">
      <button onClick={onEditProfile}>Edit Profile</button>
      <button onClick={onLogout}>Logout</button>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock("../modals/SelfEditProfileModal", () => ({
  SelfEditProfileModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="self-edit-modal">
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}));

const mockUser: AdminUser = {
  userId: "user-1",
  email: "admin@example.com",
  roles: ["admin"],
  displayName: "Admin User",
  avatar: null,
};

describe("TopBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Trigger button ─────────────────────────────────────────────────────────

  it("renders profile trigger with aria-haspopup and aria-expanded=false", () => {
    render(<TopBar user={mockUser} onLogout={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /admin user/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "true");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("shows displayName in the trigger", () => {
    render(<TopBar user={mockUser} onLogout={vi.fn()} />);
    expect(screen.getByText("Admin User")).toBeInTheDocument();
  });

  // ── Initials avatar ────────────────────────────────────────────────────────

  it("renders initials when avatar is null", () => {
    render(<TopBar user={mockUser} onLogout={vi.fn()} />);
    expect(screen.getByText("AU")).toBeInTheDocument();
  });

  it("renders initials from email when displayName is empty", () => {
    const user = { ...mockUser, displayName: "" };
    render(<TopBar user={user} onLogout={vi.fn()} />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders <img> when avatar is set", () => {
    const user = { ...mockUser, avatar: "https://example.com/avatar.png" };
    render(<TopBar user={user} onLogout={vi.fn()} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
    expect(img).toHaveAttribute("alt", "Admin User");
  });

  // ── Dropdown open/close ────────────────────────────────────────────────────

  it("opens dropdown on trigger click", async () => {
    render(<TopBar user={mockUser} onLogout={vi.fn()} />);
    expect(screen.queryByTestId("profile-dropdown")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /admin user/i }));
    expect(screen.getByTestId("profile-dropdown")).toBeInTheDocument();
  });

  it("sets aria-expanded=true when dropdown is open", async () => {
    render(<TopBar user={mockUser} onLogout={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /admin user/i }));
    expect(screen.getByRole("button", { name: /admin user/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("closes dropdown when ProfileDropdown calls onClose", async () => {
    render(<TopBar user={mockUser} onLogout={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /admin user/i }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("profile-dropdown")).not.toBeInTheDocument();
  });

  it("toggles dropdown closed on second trigger click", async () => {
    render(<TopBar user={mockUser} onLogout={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /admin user/i }));
    await userEvent.click(screen.getByRole("button", { name: /admin user/i }));
    expect(screen.queryByTestId("profile-dropdown")).not.toBeInTheDocument();
  });

  // ── Logout ─────────────────────────────────────────────────────────────────

  it("calls onLogout when Logout is clicked in dropdown", async () => {
    const onLogout = vi.fn();
    render(<TopBar user={mockUser} onLogout={onLogout} />);
    await userEvent.click(screen.getByRole("button", { name: /admin user/i }));
    await userEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  // ── Edit Profile modal ─────────────────────────────────────────────────────

  it("opens SelfEditProfileModal when Edit Profile is clicked", async () => {
    render(<TopBar user={mockUser} onLogout={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /admin user/i }));
    await userEvent.click(screen.getByRole("button", { name: "Edit Profile" }));
    await waitFor(() =>
      expect(screen.getByTestId("self-edit-modal")).toBeInTheDocument(),
    );
  });

  it("closes dropdown when Edit Profile is clicked", async () => {
    render(<TopBar user={mockUser} onLogout={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /admin user/i }));
    await userEvent.click(screen.getByRole("button", { name: "Edit Profile" }));
    expect(screen.queryByTestId("profile-dropdown")).not.toBeInTheDocument();
  });

  it("closes modal when SelfEditProfileModal calls onClose", async () => {
    render(<TopBar user={mockUser} onLogout={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /admin user/i }));
    await userEvent.click(screen.getByRole("button", { name: "Edit Profile" }));
    await userEvent.click(screen.getByRole("button", { name: "Close Modal" }));
    expect(screen.queryByTestId("self-edit-modal")).not.toBeInTheDocument();
  });
});
