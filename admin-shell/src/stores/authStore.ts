/**
 * authStore — nanostores atoms for authentication state.
 *
 * Requirements: 1.2, 1.7
 *
 * Atoms:
 *   $user            — the currently authenticated AdminUser, or null
 *   $isLoading       — true while an auth operation is in flight
 *   $error           — last auth error message, or null
 *
 * Derived:
 *   $isAuthenticated — true when $user is non-null
 *
 * Actions:
 *   login()          — authenticate with email/password, populate $user
 *   logout()         — clear session and $user
 *   initializeAuth() — restore session on app boot (calls getCurrentUser)
 */

import { atom, computed } from "nanostores";
import type { AdminUser } from "../domain/entities/AdminUser";
import { HttpAuthRepository } from "../infrastructure/repositories/HttpAuthRepository";
import { getServiceLogger } from "../utils/logger";

const logger = getServiceLogger("authStore");

// ── Atoms ─────────────────────────────────────────────────────────────────

export const $user = atom<AdminUser | null>(null);
export const $isLoading = atom<boolean>(false);
export const $error = atom<string | null>(null);

// ── Derived ───────────────────────────────────────────────────────────────

export const $isAuthenticated = computed($user, (user) => user !== null);

// ── Repository (lazy singleton) ───────────────────────────────────────────

let _repo: HttpAuthRepository | null = null;

function getRepo(): HttpAuthRepository {
  if (!_repo) {
    _repo = new HttpAuthRepository();
  }
  return _repo;
}

// ── Actions ───────────────────────────────────────────────────────────────

/**
 * Authenticate with email + password.
 * On success, sets $user. On failure, sets $error.
 */
export async function login(email: string, password: string): Promise<void> {
  $isLoading.set(true);
  $error.set(null);

  logger.logUserAction({ action: "login", target: "auth" });

  try {
    const user = await getRepo().login(email, password);
    $user.set(user);
    logger.info("Login successful", { userId: user.userId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    $error.set(message);
    logger.warn("Login failed", { error: message });
  } finally {
    $isLoading.set(false);
  }
}

/**
 * Log out the current user.
 * Clears $user regardless of whether the server call succeeds.
 */
export async function logout(): Promise<void> {
  $isLoading.set(true);
  $error.set(null);

  logger.logUserAction({ action: "logout", target: "auth" });

  try {
    await getRepo().logout();
    logger.info("Logout successful");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Logout failed";
    logger.warn("Logout request failed — clearing session anyway", {
      error: message,
    });
  } finally {
    $user.set(null);
    $isLoading.set(false);
  }
}

/**
 * Restore session on application boot.
 * Calls getCurrentUser; if the session is invalid the BFF returns 401
 * and HttpClient triggers a force-logout, so we just clear state here.
 */
export async function initializeAuth(): Promise<void> {
  $isLoading.set(true);
  $error.set(null);

  logger.debug("Initializing auth session");

  try {
    const user = await getRepo().getCurrentUser();
    $user.set(user);
    logger.info("Session restored", { userId: user.userId });
  } catch (_err) {
    // No active session — this is expected on first load.
    $user.set(null);
    logger.debug("No active session found");
  } finally {
    $isLoading.set(false);
  }
}
