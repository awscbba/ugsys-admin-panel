import type { AdminUser } from "../../domain/entities/AdminUser";
import type {
  AuthRepository,
  SelfProfileUpdateFields,
} from "../../domain/repositories/AuthRepository";
import { HttpClient } from "../http/HttpClient";

interface LoginResponseDto {
  expires_in: number;
  token_type: string;
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
    await this.http.postJson<LoginResponseDto>("/api/v1/auth/login", {
      email,
      password,
    });
    // BFF sets httpOnly cookies on login — no token in response body.
    // Fetch the current user from /me now that the cookie is set.
    return this.getCurrentUser();
  }

  async logout(): Promise<void> {
    await this.http.postJson<void>("/api/v1/auth/logout", {});
  }

  async refresh(): Promise<void> {
    await this.http.postJson<{ expires_in: number }>(
      "/api/v1/auth/refresh",
      {},
    );
    // BFF rotates cookies server-side — nothing to do client-side.
  }

  async getCurrentUser(): Promise<AdminUser> {
    const data = await this.http.getJson<MeResponseDto>("/api/v1/auth/me");
    return mapToAdminUser(data);
  }

  async updateOwnProfile(fields: SelfProfileUpdateFields): Promise<void> {
    // Map camelCase domain fields → snake_case BFF contract (P3: only send changed fields)
    const body: Record<string, string> = {};
    if (fields.displayName !== undefined)
      body.display_name = fields.displayName;
    if (fields.password !== undefined) body.password = fields.password;

    await this.http.request("/api/v1/auth/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }
}
