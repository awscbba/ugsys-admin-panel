import type { AdminUser } from '../entities/AdminUser';

export interface AuthRepository {
  login(email: string, password: string): Promise<AdminUser>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  getCurrentUser(): Promise<AdminUser>;
}
