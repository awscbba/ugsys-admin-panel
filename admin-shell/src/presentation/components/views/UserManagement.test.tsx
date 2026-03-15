/**
 * UserManagement — UPS profile pre-population tests (Task 10.1)
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 *
 * Strategy: vi.mock both repository modules so the component's useRef()
 * picks up the mocked constructors. $user atom is set directly to inject roles.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { $user } from "../../../stores/authStore";
import { RbacProvider } from "../RbacProvider";
import type { AdminUser } from "../../../domain/entities/AdminUser";
import type { UpsProfile } from "../../../domain/entities/UpsProfile";

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockListUsers = vi.fn();
const mockChangeRoles = vi.fn();
const mockChangeStatus = vi.fn();
const mockUpdateProfile = vi.fn();

vi.mock(
  "../../../infrastructure/repositories/HttpUserManagementRepository",
  () => ({
    HttpUserManagementRepository: vi.fn().mockImplementation(() => ({
      listUsers: mockListUsers,
      changeRoles: mockChangeRoles,
      changeStatus: mockChangeStatus,
      updateProfile: mockUpdateProfile,
    })),
  }),
);

const mockGetProfile = vi.fn();
const mockUpdatePersonal = vi.fn();
const mockUpdateContact = vi.fn();
const mockUpdateDisplay = vi.fn();
const mockUpdatePreferences = vi.fn();

vi.mock("../../../infrastructure/repositories/HttpUserProfileClient", () => ({
  HttpUserProfileClient: vi.fn().mockImplementation(() => ({
    getProfile: mockGetProfile,
    updatePersonal: mockUpdatePersonal,
    updateContact: mockUpdateContact,
    updateDisplay: mockUpdateDisplay,
    updatePreferences: mockUpdatePreferences,
  })),
}));

// ── Import component AFTER mocks ──────────────────────────────────────────────

import { UserManagement } from "./UserManagement";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const adminUser: AdminUser = {
  userId: "admin-1",
  email: "admin@example.com",
  roles: ["admin"],
  displayName: "Admin User",
  avatar: null,
};

const targetUser: AdminUser = {
  userId: "u-001",
  email: "alice@example.com",
  roles: ["member"],
  displayName: "Alice",
  avatar: null,
};

const sampleUpsProfile: UpsProfile = {
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

const paginatedResult = {
  items: [targetUser],
  total: 1,
  page: 1,
  pageSize: 20,
};

function renderWithAdmin() {
  $user.set(adminUser);
  return render(
    <RbacProvider>
      <UserManagement />
    </RbacProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListUsers.mockResolvedValue(paginatedResult);
  mockGetProfile.mockResolvedValue(sampleUpsProfile);
  mockUpdateProfile.mockResolvedValue(undefined);
});

afterEach(() => {
  $user.set(null);
});

// ── Edit button loading state ─────────────────────────────────────────────────

describe("UserManagement — UPS fetch on Edit click", () => {
  it("Edit button shows loading state while getProfile is in progress (Req 1.2)", async () => {
    // Delay getProfile so we can observe the loading state
    let resolveProfile!: (v: UpsProfile) => void;
    mockGetProfile.mockReturnValue(
      new Promise<UpsProfile>((res) => {
        resolveProfile = res;
      }),
    );

    renderWithAdmin();
    // Wait for the user row to appear
    expect(
      await screen.findByRole("button", { name: /edit profile for alice/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /edit profile for alice/i }),
    );

    // Button should be disabled / show loading indicator while fetch is pending
    await waitFor(() => {
      const editBtn = screen.getByRole("button", {
        name: /edit profile for alice/i,
      });
      expect(editBtn).toBeDisabled();
    });

    // Resolve and clean up
    resolveProfile(sampleUpsProfile);
  });

  it("opens EditProfileModal with fetched upsProfile on success (Req 1.3)", async () => {
    mockGetProfile.mockResolvedValue(sampleUpsProfile);

    renderWithAdmin();
    expect(
      await screen.findByRole("button", { name: /edit profile for alice/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /edit profile for alice/i }),
    );

    // Modal should open
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(mockGetProfile).toHaveBeenCalledWith("u-001");
  });

  it("opens modal with upsProfile=null on 404 from getProfile (Req 1.4)", async () => {
    const notFoundError = Object.assign(new Error("Not found"), {
      status: 404,
    });
    mockGetProfile.mockRejectedValue(notFoundError);

    renderWithAdmin();
    expect(
      await screen.findByRole("button", { name: /edit profile for alice/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /edit profile for alice/i }),
    );

    // Modal should still open (with null upsProfile — no UPS fields pre-populated)
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("shows dismissible row-level error banner on 5xx and does not open modal (Req 1.5)", async () => {
    const serverError = Object.assign(new Error("Server error"), {
      status: 500,
    });
    mockGetProfile.mockRejectedValue(serverError);

    renderWithAdmin();
    expect(
      await screen.findByRole("button", { name: /edit profile for alice/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /edit profile for alice/i }),
    );

    // Error banner should appear, modal should NOT open
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears editLoadingUserId after fetch completes (Req 1.2)", async () => {
    mockGetProfile.mockResolvedValue(sampleUpsProfile);

    renderWithAdmin();
    expect(
      await screen.findByRole("button", { name: /edit profile for alice/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /edit profile for alice/i }),
    );

    // After modal opens, the edit button should no longer be in loading state
    await screen.findByRole("dialog");
    const editBtn = screen.getByRole("button", {
      name: /edit profile for alice/i,
    });
    expect(editBtn).not.toBeDisabled();
  });
});
