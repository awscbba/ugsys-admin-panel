import type { AdminUser } from '../../domain/entities/AdminUser';
import type { AuthRepository } from '../../domain/repositories/AuthRepository';
import { HttpClient } from '../http/HttpClient';

interface LoginResponseDto {
  accessToken: string;
  user: {
    user_id: string;
    email: string;
    roles: string[];
    display_name: string;
    avatar: string | null;
  };
}

interface MeResponseDto {
  user_id: string;
  email: string;
  roles: string[];
  display_name: string;
  avatar: string | null;
}

function mapToAdminUser(dto: MeResponseDto): AdminUser {
  return {
    userId: dto.user_id,
    email: dto.email,
    roles: dto.roles,
    displayName: dto.display_name,
    avatar: dto.avatar,
  };
}

export class HttpAuthRepository implements AuthRepository {
  private readonly http: HttpClient;

  constructor() {
    this.http = HttpClient.getInstance();
  }

  async login(email: string, password: string): Promise<AdminUser> {
    const data = await this.http.postJson<LoginResponseDto>(
      '/api/v1/auth/login',
      { email, password },
    );
    this.http.setAccessToken(data.accessToken);
    return mapToAdminUser(data.user);
  }

  async logout(): Promise<void> {
    await this.http.postJson<void>('/api/v1/auth/logout', {});
    this.http.setAccessToken(null);
  }

  async refresh(): Promise<void> {
    const data = await this.http.postJson<{ accessToken: string }>(
      '/api/v1/auth/refresh',
      {},
    );
    this.http.setAccessToken(data.accessToken);
  }

  async getCurrentUser(): Promise<AdminUser> {
    const data = await this.http.getJson<MeResponseDto>('/api/v1/auth/me');
    return mapToAdminUser(data);
  }
}
