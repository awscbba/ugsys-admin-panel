export interface AdminUser {
  userId: string;
  email: string;
  roles: string[];
  displayName: string;
  avatar: string | null;
}
