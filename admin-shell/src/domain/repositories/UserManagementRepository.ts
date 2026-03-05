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

export interface UserManagementRepository {
  listUsers(query?: UserListQuery): Promise<PaginatedUsers>;
  changeRoles(userId: string, roles: string[]): Promise<void>;
  changeStatus(userId: string, status: "active" | "inactive"): Promise<void>;
}
