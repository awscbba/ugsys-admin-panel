import type { AdminUser } from "../entities/AdminUser";

/**
 * Fields that can be updated via self-service profile edit.
 * Both are optional — at least one must be present (enforced by the modal).
 */
export interface SelfProfileUpdateFields {
  /** New display name. Omit to leave unchanged. */
  displayName?: string;
  /** New password. Omit to leave unchanged. */
  password?: string;
}

export interface AuthRepository {
  login(email: string, password: string): Promise<AdminUser>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  getCurrentUser(): Promise<AdminUser>;
  /** Self-service profile update — display name and/or password. */
  updateOwnProfile(fields: SelfProfileUpdateFields): Promise<void>;
}
