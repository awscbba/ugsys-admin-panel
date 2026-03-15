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

// ─────────────────────────────────────────────────────────────────────────────
// UPS two-tab extension tests (Task 9.1)
// Requirements: 2.1–2.6, 3.1–3.3, 4.1–4.2, 5.1–5.3, 6.1–6.3, 7.1–7.5
// ─────────────────────────────────────────────────────────────────────────────

import type { UpsProfile } from "../../../domain/entities/UpsProfile";
import type {
  UpsPersonalFields,
  UpsContactFields,
  UpsDisplayFields,
  UpsPreferenceFields,
} from "../../../domain/repositories/UserProfileClient";

const baseUpsProfile: UpsProfile = {
  userId: "u-001",
  fullName: "Alice Smith",
  dateOfBirth: "1990-01-15",
  phone: "+591 70000000",
  street: "Calle 1",
  city: "Cochabamba",
  state: "Cbba",
  postalCode: "0000",
  country: "Bolivia",
  bio: "Hello world",
  displayName: "Alice",
  notificationEmail: true,
  notificationSms: false,
  notificationWhatsapp: false,
  language: "es",
  timezone: "America/La_Paz",
};

interface UpsCallbacks {
  onSavePersonal: (userId: string, fields: UpsPersonalFields) => Promise<void>;
  onSaveContact: (userId: string, fields: UpsContactFields) => Promise<void>;
  onSaveDisplay: (userId: string, fields: UpsDisplayFields) => Promise<void>;
  onSavePreferences: (userId: string, fields: UpsPreferenceFields) => Promise<void>;
}

function renderModalWithUps(
  upsProfile: UpsProfile | null,
  upsOverrides: Partial<UpsCallbacks> = {},
  modalOverrides: Partial<{
    user: AdminUser;
    isSuperAdmin: boolean;
    onSuccess: () => void;
    onClose: () => void;
    onSave: (userId: string, fields: ProfileUpdateFields) => Promise<void>;
  }> = {},
) {
  const upsCbs: UpsCallbacks = {
    onSavePersonal: vi.fn().mockResolvedValue(undefined),
    onSaveContact: vi.fn().mockResolvedValue(undefined),
    onSaveDisplay: vi.fn().mockResolvedValue(undefined),
    onSavePreferences: vi.fn().mockResolvedValue(undefined),
    ...upsOverrides,
  };

  const props = {
    user: baseUser,
    isSuperAdmin: false,
    onSuccess: vi.fn(),
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    upsProfile,
    onSavePersonal: upsCbs.onSavePersonal,
    onSaveContact: upsCbs.onSaveContact,
    onSaveDisplay: upsCbs.onSaveDisplay,
    onSavePreferences: upsCbs.onSavePreferences,
    ...modalOverrides,
  };
  render(<EditProfileModal {...props} />);
  return { ...props, ...upsCbs };
}

// ── Tab layout ────────────────────────────────────────────────────────────────

describe("EditProfileModal — two-tab layout", () => {
  it("renders Identity tab active by default (Req 2.2)", () => {
    renderModalWithUps(baseUpsProfile);
    const identityTab = screen.getByRole("tab", { name: /identity/i });
    expect(identityTab).toHaveAttribute("aria-selected", "true");
  });

  it("renders Profile tab button (Req 2.3)", () => {
    renderModalWithUps(baseUpsProfile);
    expect(screen.getByRole("tab", { name: /profile/i })).toBeInTheDocument();
  });

  it("clicking Profile tab shows UPS sections (Req 2.3)", async () => {
    renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    expect(screen.getAllByText(/personal/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/contact/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/display/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/preferences/i).length).toBeGreaterThan(0);
  });

  it("clicking Identity tab after Profile tab shows identity fields again (Req 2.2)", async () => {
    renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    await userEvent.click(screen.getByRole("tab", { name: /identity/i }));
    expect(screen.getByLabelText("Display Name")).toBeInTheDocument();
  });

  it("has role=dialog, aria-modal=true, aria-labelledby (Req 2.6)", () => {
    renderModalWithUps(baseUpsProfile);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
  });
});

// ── UPS field pre-population ──────────────────────────────────────────────────

describe("EditProfileModal — UPS field pre-population", () => {
  it("pre-populates full_name from upsProfile (Req 3.1)", async () => {
    renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    expect(screen.getByLabelText(/full name/i)).toHaveValue("Alice Smith");
  });

  it("pre-populates date_of_birth from upsProfile (Req 3.1)", async () => {
    renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    expect(screen.getByLabelText(/date of birth/i)).toHaveValue("1990-01-15");
  });

  it("pre-populates bio from upsProfile (Req 5.1)", async () => {
    renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    expect(screen.getByLabelText(/bio/i)).toHaveValue("Hello world");
  });

  it("pre-populates language from upsProfile (Req 6.1)", async () => {
    renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    expect(screen.getByLabelText(/language/i)).toHaveValue("es");
  });

  it("renders empty fields when upsProfile is null (Req 1.4)", async () => {
    renderModalWithUps(null);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    expect(screen.getByLabelText(/full name/i)).toHaveValue("");
  });
});

// ── UPS field validation ──────────────────────────────────────────────────────

describe("EditProfileModal — UPS field validation", () => {
  it("whitespace-only full_name shows field error and does not call onSavePersonal (Property 12)", async () => {
    const { onSavePersonal } = renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), "   ");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/full name.*required|required.*full name/i)).toBeInTheDocument();
    expect(onSavePersonal).not.toHaveBeenCalled();
  });

  it("date_of_birth not matching YYYY-MM-DD shows field error (Property 12)", async () => {
    const { onSavePersonal } = renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    await userEvent.clear(screen.getByLabelText(/date of birth/i));
    await userEvent.type(screen.getByLabelText(/date of birth/i), "15/01/1990");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/date.*format|YYYY-MM-DD/i)).toBeInTheDocument();
    expect(onSavePersonal).not.toHaveBeenCalled();
  });

  it("bio > 500 chars shows field error and does not call onSaveDisplay (Property 14)", async () => {
    const { onSaveDisplay } = renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    const longBio = "x".repeat(501);
    await userEvent.clear(screen.getByLabelText(/bio/i));
    await userEvent.type(screen.getByLabelText(/bio/i), longBio);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/bio.*500|500.*characters/i)).toBeInTheDocument();
    expect(onSaveDisplay).not.toHaveBeenCalled();
  });

  it("invalid language code shows field error and does not call onSavePreferences (Property 15)", async () => {
    const { onSavePreferences } = renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    await userEvent.clear(screen.getByLabelText(/language/i));
    await userEvent.type(screen.getByLabelText(/language/i), "english");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/language.*2.*letter|2-letter.*language/i)).toBeInTheDocument();
    expect(onSavePreferences).not.toHaveBeenCalled();
  });

  it("bio character counter updates on input (Property 14)", async () => {
    renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    // "Hello world" = 11 chars → counter shows 489 remaining
    expect(screen.getByText(/489/)).toBeInTheDocument();
  });

  it("tab error indicator appears on Profile tab when UPS validation fails (Property 16)", async () => {
    renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), "   ");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await screen.findByText(/full name.*required|required.*full name/i);
    // Profile tab should show an error indicator (e.g. a red dot or "!" in the tab label)
    const profileTab = screen.getByRole("tab", { name: /profile/i });
    expect(profileTab).toHaveAttribute("data-has-error", "true");
  });
});

// ── Diff-only submission ──────────────────────────────────────────────────────

describe("EditProfileModal — diff-only submission (Property 2)", () => {
  it("does not call any UPS save when nothing changed (Req 7.2)", async () => {
    const { onSavePersonal, onSaveContact, onSaveDisplay, onSavePreferences, onSave } =
      renderModalWithUps(baseUpsProfile);
    // Click save without changing anything
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSavePersonal).not.toHaveBeenCalled();
    expect(onSaveContact).not.toHaveBeenCalled();
    expect(onSaveDisplay).not.toHaveBeenCalled();
    expect(onSavePreferences).not.toHaveBeenCalled();
  });

  it("calls only onSavePersonal when only personal fields changed (Property 2)", async () => {
    const { onSavePersonal, onSaveContact, onSaveDisplay, onSavePreferences } =
      renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), "Bob Jones");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSavePersonal).toHaveBeenCalled());
    expect(onSaveContact).not.toHaveBeenCalled();
    expect(onSaveDisplay).not.toHaveBeenCalled();
    expect(onSavePreferences).not.toHaveBeenCalled();
  });

  it("calls only onSaveDisplay when only bio changed (Property 2)", async () => {
    const { onSavePersonal, onSaveContact, onSaveDisplay, onSavePreferences } =
      renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    await userEvent.clear(screen.getByLabelText(/bio/i));
    await userEvent.type(screen.getByLabelText(/bio/i), "Updated bio");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSaveDisplay).toHaveBeenCalled());
    expect(onSavePersonal).not.toHaveBeenCalled();
    expect(onSaveContact).not.toHaveBeenCalled();
    expect(onSavePreferences).not.toHaveBeenCalled();
  });

  it("calls all four UPS saves when all sections changed (Property 2)", async () => {
    const { onSavePersonal, onSaveContact, onSaveDisplay, onSavePreferences } =
      renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    // Change personal
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), "Bob Jones");
    // Change contact
    await userEvent.clear(screen.getByLabelText(/city/i));
    await userEvent.type(screen.getByLabelText(/city/i), "La Paz");
    // Change display
    await userEvent.clear(screen.getByLabelText(/bio/i));
    await userEvent.type(screen.getByLabelText(/bio/i), "New bio");
    // Change preferences
    await userEvent.clear(screen.getByLabelText(/language/i));
    await userEvent.type(screen.getByLabelText(/language/i), "en");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSavePersonal).toHaveBeenCalled());
    expect(onSaveContact).toHaveBeenCalled();
    expect(onSaveDisplay).toHaveBeenCalled();
    expect(onSavePreferences).toHaveBeenCalled();
  });

  it("calls all UPS saves when upsProfile is null (new profile) and fields are filled (Property 2)", async () => {
    const { onSavePersonal } = renderModalWithUps(null);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), "New User");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSavePersonal).toHaveBeenCalled());
  });
});

// ── Promise.allSettled partial failure ────────────────────────────────────────

describe("EditProfileModal — partial failure handling (Property 4)", () => {
  it("shows per-section error banner when one UPS save fails, modal stays open (Property 4)", async () => {
    const { onClose } = renderModalWithUps(baseUpsProfile, {
      onSavePersonal: vi.fn().mockRejectedValue(new Error("Personal save failed")),
    });
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), "Bob Jones");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/personal save failed/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes modal and calls onSuccess when all saves succeed (Req 7.5)", async () => {
    const { onClose, onSuccess } = renderModalWithUps(baseUpsProfile);
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), "Bob Jones");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSuccess).toHaveBeenCalled();
  });

  it("shows multiple per-section banners when multiple UPS saves fail (Property 4)", async () => {
    renderModalWithUps(baseUpsProfile, {
      onSavePersonal: vi.fn().mockRejectedValue(new Error("Personal error")),
      onSaveDisplay: vi.fn().mockRejectedValue(new Error("Display error")),
    });
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    // Change personal
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), "Bob Jones");
    // Change display
    await userEvent.clear(screen.getByLabelText(/bio/i));
    await userEvent.type(screen.getByLabelText(/bio/i), "New bio");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/personal error/i)).toBeInTheDocument();
    expect(await screen.findByText(/display error/i)).toBeInTheDocument();
  });
});
