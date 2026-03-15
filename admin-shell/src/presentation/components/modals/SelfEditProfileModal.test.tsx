/**
 * Tests for SelfEditProfileModal component.
 * Requirements: 7.4 — pre-population, validation, diff-only submission, 204 closes, error banner, buttons disabled while saving
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminUser } from "../../../domain/entities/AdminUser";
import { SelfEditProfileModal } from "./SelfEditProfileModal";

// Mock authStore.updateOwnProfile
vi.mock("../../../stores/authStore", () => ({
  updateOwnProfile: vi.fn(),
  $isLoading: { get: () => false, set: vi.fn(), subscribe: vi.fn() },
}));

import { updateOwnProfile } from "../../../stores/authStore";

const mockUser: AdminUser = {
  userId: "user-1",
  email: "admin@example.com",
  roles: ["admin"],
  displayName: "Admin User",
  avatar: null,
};

function renderModal(overrides?: { user?: AdminUser; onClose?: () => void }) {
  const onClose = overrides?.onClose ?? vi.fn();
  const user = overrides?.user ?? mockUser;
  render(<SelfEditProfileModal user={user} onClose={onClose} />);
  return { onClose };
}

describe("SelfEditProfileModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it("has role=dialog with aria-modal and aria-labelledby", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
  });

  it("pre-populates display name from user prop", () => {
    renderModal();
    const input = screen.getByLabelText(/display name/i);
    expect(input).toHaveValue("Admin User");
  });

  it("password fields start empty", () => {
    renderModal();
    expect(screen.getByLabelText(/new password/i)).toHaveValue("");
    expect(screen.getByLabelText(/confirm password/i)).toHaveValue("");
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it("shows error when display name is blank", async () => {
    renderModal();
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/display name is required/i)).toBeInTheDocument();
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });

  it("shows error when display name is whitespace only", async () => {
    renderModal();
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), "   ");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/display name is required/i)).toBeInTheDocument();
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });

  it("shows error when display name exceeds 100 chars", async () => {
    renderModal();
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(
      screen.getByLabelText(/display name/i),
      "a".repeat(101),
    );
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/100 characters/i)).toBeInTheDocument();
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });

  it("shows error when password is less than 8 chars", async () => {
    renderModal();
    await userEvent.type(screen.getByLabelText(/new password/i), "short");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "short");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });

  it("shows error when passwords do not match (P6)", async () => {
    renderModal();
    await userEvent.type(screen.getByLabelText(/new password/i), "password123");
    await userEvent.type(
      screen.getByLabelText(/confirm password/i),
      "different1",
    );
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });

  // ── Diff-only submission (P3) ──────────────────────────────────────────────

  it("does NOT include displayName in payload when unchanged (P3)", async () => {
    vi.mocked(updateOwnProfile).mockResolvedValue(undefined);
    renderModal();
    // displayName unchanged — only set a new password
    await userEvent.type(screen.getByLabelText(/new password/i), "newpass123");
    await userEvent.type(
      screen.getByLabelText(/confirm password/i),
      "newpass123",
    );
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(updateOwnProfile).toHaveBeenCalledOnce());
    const [fields] = vi.mocked(updateOwnProfile).mock.calls[0]!;
    expect(fields).not.toHaveProperty("displayName");
    expect(fields).toHaveProperty("password", "newpass123");
  });

  it("includes displayName when changed", async () => {
    vi.mocked(updateOwnProfile).mockResolvedValue(undefined);
    renderModal();
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), "New Name");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(updateOwnProfile).toHaveBeenCalledOnce());
    const [fields] = vi.mocked(updateOwnProfile).mock.calls[0]!;
    expect(fields).toHaveProperty("displayName", "New Name");
  });

  // ── Success path ───────────────────────────────────────────────────────────

  it("closes modal on successful save (204)", async () => {
    vi.mocked(updateOwnProfile).mockResolvedValue(undefined);
    const { onClose } = renderModal();
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(
      screen.getByLabelText(/display name/i),
      "Updated Name",
    );
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  // ── Error banner ───────────────────────────────────────────────────────────

  it("shows dismissible error banner on failure", async () => {
    vi.mocked(updateOwnProfile).mockRejectedValue(
      new Error("Service unavailable"),
    );
    renderModal();
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), "New Name");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Service unavailable",
      ),
    );
  });

  it("dismisses error banner when close button clicked", async () => {
    vi.mocked(updateOwnProfile).mockRejectedValue(new Error("Oops"));
    renderModal();
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), "New Name");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // ── Buttons disabled while saving ─────────────────────────────────────────

  it("disables Save and Cancel while saving", async () => {
    let resolve!: () => void;
    vi.mocked(updateOwnProfile).mockReturnValue(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    renderModal();
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), "New Name");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();

    resolve();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled(),
    );
  });

  // ── Cancel ─────────────────────────────────────────────────────────────────

  it("calls onClose when Cancel is clicked", async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
