import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { EditProfileModal } from "./EditProfileModal";
import type { AdminUser } from "../../../domain/entities/AdminUser";
import type { ProfileUpdateFields } from "../../../domain/repositories/UserManagementRepository";

const baseUser: AdminUser = {
  userId: "u-001",
  email: "alice@example.com",
  roles: ["admin"],
  displayName: "Alice Admin",
  avatar: null,
};

function renderModal(
  overrides: Partial<{
    user: AdminUser;
    isSuperAdmin: boolean;
    onSuccess: () => void;
    onClose: () => void;
    onSave: (userId: string, fields: ProfileUpdateFields) => Promise<void>;
  }> = {},
) {
  const props = {
    user: baseUser,
    isSuperAdmin: false,
    onSuccess: vi.fn(),
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<EditProfileModal {...props} />);
  return props;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe("EditProfileModal — rendering", () => {
  it("renders dialog with correct title", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Edit Profile")).toBeInTheDocument();
  });

  it("pre-populates display name from user", () => {
    renderModal();
    expect(screen.getByLabelText("Display Name")).toHaveValue("Alice Admin");
  });

  it("pre-populates email from user", () => {
    renderModal();
    expect(screen.getByLabelText(/Email/)).toHaveValue("alice@example.com");
  });

  it("shows user displayName as subtitle", () => {
    renderModal();
    expect(screen.getByText("Alice Admin")).toBeInTheDocument();
  });

  it("shows user email as subtitle when displayName is empty", () => {
    renderModal({ user: { ...baseUser, displayName: "" } });
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });
});

// ── Admin role (isSuperAdmin=false) ───────────────────────────────────────────

describe("EditProfileModal — admin role", () => {
  it("email field is read-only for admin", () => {
    renderModal({ isSuperAdmin: false });
    expect(screen.getByLabelText(/Email/)).toHaveAttribute("readOnly");
  });

  it("shows (read-only) label hint for admin", () => {
    renderModal({ isSuperAdmin: false });
    expect(screen.getByText("(read-only)")).toBeInTheDocument();
  });

  it("does not render password field for admin", () => {
    renderModal({ isSuperAdmin: false });
    expect(screen.queryByLabelText("New Password")).not.toBeInTheDocument();
  });
});

// ── Super admin role (isSuperAdmin=true) ──────────────────────────────────────

describe("EditProfileModal — super_admin role", () => {
  it("email field is editable for super_admin", () => {
    renderModal({ isSuperAdmin: true });
    expect(screen.getByLabelText(/Email/)).not.toHaveAttribute("readOnly");
  });

  it("does not show (read-only) hint for super_admin", () => {
    renderModal({ isSuperAdmin: true });
    expect(screen.queryByText("(read-only)")).not.toBeInTheDocument();
  });

  it("renders password field for super_admin", () => {
    renderModal({ isSuperAdmin: true });
    expect(screen.getByLabelText("New Password")).toBeInTheDocument();
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe("EditProfileModal — validation", () => {
  it("shows error when display name is cleared and Save is clicked", async () => {
    renderModal();
    await userEvent.clear(screen.getByLabelText("Display Name"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Display name is required."),
    ).toBeInTheDocument();
  });

  it("does not call onSave when display name is empty", async () => {
    const { onSave } = renderModal();
    await userEvent.clear(screen.getByLabelText("Display Name"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByText("Display name is required.")).toBeInTheDocument(),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows email error for invalid email (super_admin)", async () => {
    renderModal({ isSuperAdmin: true });
    await userEvent.clear(screen.getByLabelText(/Email/));
    await userEvent.type(screen.getByLabelText(/Email/), "not-an-email");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeInTheDocument();
  });

  it("shows password error when password is too short (super_admin)", async () => {
    renderModal({ isSuperAdmin: true });
    await userEvent.type(screen.getByLabelText("New Password"), "short");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Password must be at least 8 characters."),
    ).toBeInTheDocument();
  });

  it("does not show password error when password field is blank (super_admin)", async () => {
    const { onSave } = renderModal({ isSuperAdmin: true });
    // leave password blank — should be valid
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(
      screen.queryByText("Password must be at least 8 characters."),
    ).not.toBeInTheDocument();
  });
});

// ── Save behaviour ────────────────────────────────────────────────────────────

describe("EditProfileModal — save behaviour", () => {
  it("calls onSave with userId and changed displayName", async () => {
    const { onSave } = renderModal();
    await userEvent.clear(screen.getByLabelText("Display Name"));
    await userEvent.type(
      screen.getByLabelText("Display Name"),
      "Alice Updated",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith("u-001", {
      displayName: "Alice Updated",
    });
  });

  it("sends displayName even when nothing changed (no-op diff)", async () => {
    const { onSave } = renderModal();
    // displayName unchanged — should still send it
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith("u-001", {
      displayName: "Alice Admin",
    });
  });

  it("calls onSuccess and onClose after successful save", async () => {
    const { onSuccess, onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("super_admin can update email", async () => {
    const { onSave } = renderModal({ isSuperAdmin: true });
    await userEvent.clear(screen.getByLabelText(/Email/));
    await userEvent.type(screen.getByLabelText(/Email/), "new@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [, fields] = (onSave as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fields.email).toBe("new@example.com");
  });

  it("super_admin can set password", async () => {
    const { onSave } = renderModal({ isSuperAdmin: true });
    await userEvent.type(screen.getByLabelText("New Password"), "Str0ng!Pass");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [, fields] = (onSave as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fields.password).toBe("Str0ng!Pass");
  });

  it("admin cannot update email even if field value changes (readOnly enforced by server)", async () => {
    // For admin, email is readOnly — userEvent.type on readOnly input is a no-op
    const { onSave } = renderModal({ isSuperAdmin: false });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [, fields] = (onSave as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fields.email).toBeUndefined();
  });
});

// ── Error banner ──────────────────────────────────────────────────────────────

describe("EditProfileModal — error banner", () => {
  it("shows error banner when onSave rejects", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Server error"));
    renderModal({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Server error")).toBeInTheDocument();
  });

  it("shows fallback message for non-Error rejections", async () => {
    const onSave = vi.fn().mockRejectedValue("oops");
    renderModal({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("An unexpected error occurred."),
    ).toBeInTheDocument();
  });

  it("dismisses banner when ✕ is clicked", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Server error"));
    renderModal({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// ── Cancel ────────────────────────────────────────────────────────────────────

describe("EditProfileModal — cancel", () => {
  it("calls onClose when Cancel is clicked", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onSave when Cancel is clicked", () => {
    const { onSave } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
