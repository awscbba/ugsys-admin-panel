import type { AdminUser } from '../../domain/entities/AdminUser';
import type {
  UserManagementRepository,
  UserListQuery,
  PaginatedUsers,
} from '../../domain/repositories/UserManagementRepository';
import { HttpClient } from '../http/HttpClient';

interface AdminUserDto {
  user_id: string;
  email: string;
  roles: string[];
  display_name: string;
  avatar: string | null;
}

interface PaginatedUsersDto {
  items: AdminUserDto[];
  total: number;
  page: number;
  page_size: number;
}

function mapAdminUser(dto: AdminUserDto): AdminUser {
  return {
    userId: dto.user_id,
    email: dto.email,
    roles: dto.roles,
    displayName: dto.display_name,
    avatar: dto.avatar,
  };
}

function buildQueryString(query?: UserListQuery): string {
  if (!query) return '';
  const params = new URLSearchParams();
  if (query.search !== undefined) params.set('search', query.search);
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('page_size', String(query.pageSize));
  if (query.role !== undefined) params.set('role', query.role);
  if (query.status !== undefined) params.set('status', query.status);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export class HttpUserManagementRepository implements UserManagementRepository {
  private readonly http: HttpClient;

  constructor() {
    this.http = HttpClient.getInstance();
  }

  async listUsers(query?: UserListQuery): Promise<PaginatedUsers> {
    const qs = buildQueryString(query);
    const data = await this.http.getJson<PaginatedUsersDto>(`/api/v1/users${qs}`);
    return {
      items: data.items.map(mapAdminUser),
      total: data.total,
      page: data.page,
      pageSize: data.page_size,
    };
  }

  async changeRoles(userId: string, roles: string[]): Promise<void> {
    await this.http.request(
      `/api/v1/users/${encodeURIComponent(userId)}/roles`,
      { method: 'PATCH', body: JSON.stringify({ roles }) },
    );
  }

  async changeStatus(userId: string, status: 'active' | 'inactive'): Promise<void> {
    await this.http.request(
      `/api/v1/users/${encodeURIComponent(userId)}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
    );
  }
}
