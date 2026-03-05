/**
 * Tests for authStore atoms and actions.
 * Requirements: 1.2, 1.7
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdminUser } from "../domain/entities/AdminUser";

// Mock the repository before importing the store
vi.mock("../infrastructure/repositories/HttpAuthRepository");

import { HttpAuthRepository } from "../infrastructure/repositories/HttpAuthRepository";
import {
  $user,
  $isLoading,
  $error,
  $isAuthenticated,
  login,
  logout,
  initializeAuth,
} from "./authStore";

const mockUser: AdminUser = {
  userId: "user-1",
  email: "admin@example.com",
  roles: ["admin"],
  displayName: "Admin User",
  avatar: null,
};

// Typed mock instance
const mockRepo = {
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
  refresh: vi.fn(),
};

beforeEach(() => {
  // Reset atom state
  $user.set(null);
  $isLoading.set(false);
  $error.set(null);

  // Reset all mocks
  vi.clearAllMocks();

  // Make the constructor return our mock repo
  vi.mocked(HttpAuthRepository).mockImplementation(
    () => mockRepo as unknown as HttpAuthRepository,
  );
});

describe("$isAuthenticated", () => {
  it("is false when $user is null", () => {
    $user.set(null);
    expect($isAuthenticated.get()).toBe(false);
  });

  it("is true when $user is set", () => {
    $user.set(mockUser);
    expect($isAuthenticated.get()).toBe(true);
  });
});

describe("login()", () => {
  it("sets $user on success", async () => {
    mockRepo.login.mockResolvedValue(mockUser);

    await login("admin@example.com", "password");

    expect($user.get()).toEqual(mockUser);
    expect($error.get()).toBeNull();
    expect($isLoading.get()).toBe(false);
  });

  it("sets $error on failure", async () => {
    mockRepo.login.mockRejectedValue(new Error("Invalid credentials"));

    await login("admin@example.com", "wrong");

    expect($user.get()).toBeNull();
    expect($error.get()).toBe("Invalid credentials");
    expect($isLoading.get()).toBe(false);
  });

  it("sets $error to fallback message for non-Error rejections", async () => {
    mockRepo.login.mockRejectedValue("unexpected");

    await login("admin@example.com", "pass");

    expect($error.get()).toBe("Login failed");
  });

  it("clears $error before attempting login", async () => {
    $error.set("previous error");
    mockRepo.login.mockResolvedValue(mockUser);

    await login("admin@example.com", "password");

    expect($error.get()).toBeNull();
  });

  it("sets $isLoading to false after success", async () => {
    mockRepo.login.mockResolvedValue(mockUser);
    await login("admin@example.com", "password");
    expect($isLoading.get()).toBe(false);
  });

  it("sets $isLoading to false after failure", async () => {
    mockRepo.login.mockRejectedValue(new Error("fail"));
    await login("admin@example.com", "password");
    expect($isLoading.get()).toBe(false);
  });
});

describe("logout()", () => {
  it("clears $user on success", async () => {
    $user.set(mockUser);
    mockRepo.logout.mockResolvedValue(undefined);

    await logout();

    expect($user.get()).toBeNull();
    expect($isLoading.get()).toBe(false);
  });

  it("clears $user even when server call fails", async () => {
    $user.set(mockUser);
    mockRepo.logout.mockRejectedValue(new Error("Network error"));

    await logout();

    expect($user.get()).toBeNull();
    expect($isLoading.get()).toBe(false);
  });

  it("sets $isLoading to false after completion", async () => {
    mockRepo.logout.mockResolvedValue(undefined);
    await logout();
    expect($isLoading.get()).toBe(false);
  });
});

describe("initializeAuth()", () => {
  it("sets $user when session exists", async () => {
    mockRepo.getCurrentUser.mockResolvedValue(mockUser);

    await initializeAuth();

    expect($user.get()).toEqual(mockUser);
    expect($isLoading.get()).toBe(false);
  });

  it("sets $user to null when no session exists", async () => {
    mockRepo.getCurrentUser.mockRejectedValue(new Error("Unauthorized"));

    await initializeAuth();

    expect($user.get()).toBeNull();
    expect($isLoading.get()).toBe(false);
  });

  it("sets $isLoading to false after completion", async () => {
    mockRepo.getCurrentUser.mockResolvedValue(mockUser);
    await initializeAuth();
    expect($isLoading.get()).toBe(false);
  });
});
