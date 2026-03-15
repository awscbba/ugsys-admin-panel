import type { AdminUser } from "../entities/AdminUser";

export interface UserListQuery {
  search?: string;
  page?: number;
  pageSize?: number;
  role?: string;
  status?: "active" | "inactive";
}

export interface PaginatedUsers {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProfileUpdateFields {
  /** Always editable by admin and super_admin. */
  displayName?: string;
  /** Editable by super_admin only — server enforces this. */
  email?: string;
  /** Settable by super_admin only — server enforces this. */
  password?: string;
}

export interface UserManagementRepository {
  listUsers(query?: UserListQuery): Promise<PaginatedUsers>;
  changeRoles(userId: string, roles: string[]): Promise<void>;
  changeStatus(userId: string, status: "active" | "inactive"): Promise<void>;
  updateProfile(userId: string, fields: ProfileUpdateFields): Promise<void>;
}
