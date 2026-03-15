/**
 * HttpUserProfileClient — infrastructure adapter for UPS profile endpoints.
 *
 * Maps camelCase domain types ↔ snake_case wire format.
 *
 * Requirements: 1.7, 3.4, 4.3, 5.4, 6.4, 14.3
 */

import type { UpsProfile } from "../../domain/entities/UpsProfile";
import type {
  UserProfileClient,
  UpsPersonalFields,
  UpsContactFields,
  UpsDisplayFields,
  UpsPreferenceFields,
} from "../../domain/repositories/UserProfileClient";
import { HttpClient } from "../http/HttpClient";

// ── Wire DTO (snake_case from BFF) ────────────────────────────────────────────

interface UpsProfileDto {
  user_id: string;
  full_name: string | null;
  date_of_birth: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  bio: string | null;
  display_name: string | null;
  notification_email: boolean | null;
  notification_sms: boolean | null;
  notification_whatsapp: boolean | null;
  language: string | null;
  timezone: string | null;
}

function mapDto(dto: UpsProfileDto): UpsProfile {
  return {
    userId: dto.user_id,
    fullName: dto.full_name,
    dateOfBirth: dto.date_of_birth,
    phone: dto.phone,
    street: dto.street,
    city: dto.city,
    state: dto.state,
    postalCode: dto.postal_code,
    country: dto.country,
    bio: dto.bio,
    displayName: dto.display_name,
    notificationEmail: dto.notification_email,
    notificationSms: dto.notification_sms,
    notificationWhatsapp: dto.notification_whatsapp,
    language: dto.language,
    timezone: dto.timezone,
  };
}

// ── Implementation ────────────────────────────────────────────────────────────

export class HttpUserProfileClient implements UserProfileClient {
  private readonly http: HttpClient;

  constructor() {
    this.http = HttpClient.getInstance();
  }

  async getProfile(userId: string): Promise<UpsProfile> {
    const dto = await this.http.getJson<UpsProfileDto>(
      `/api/v1/users/${encodeURIComponent(userId)}/ups-profile`,
    );
    return mapDto(dto);
  }

  async updatePersonal(
    userId: string,
    fields: UpsPersonalFields,
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (fields.fullName !== undefined) body.full_name = fields.fullName;
    if (fields.dateOfBirth !== undefined)
      body.date_of_birth = fields.dateOfBirth;
    await this.http.request(
      `/api/v1/users/${encodeURIComponent(userId)}/ups-profile/personal`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
  }

  async updateContact(userId: string, fields: UpsContactFields): Promise<void> {
    const body: Record<string, unknown> = {};
    if (fields.phone !== undefined) body.phone = fields.phone;
    if (fields.street !== undefined) body.street = fields.street;
    if (fields.city !== undefined) body.city = fields.city;
    if (fields.state !== undefined) body.state = fields.state;
    if (fields.postalCode !== undefined) body.postal_code = fields.postalCode;
    if (fields.country !== undefined) body.country = fields.country;
    await this.http.request(
      `/api/v1/users/${encodeURIComponent(userId)}/ups-profile/contact`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
  }

  async updateDisplay(userId: string, fields: UpsDisplayFields): Promise<void> {
    const body: Record<string, unknown> = {};
    if (fields.bio !== undefined) body.bio = fields.bio;
    if (fields.displayName !== undefined)
      body.display_name = fields.displayName;
    await this.http.request(
      `/api/v1/users/${encodeURIComponent(userId)}/ups-profile/display`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
  }

  async updatePreferences(
    userId: string,
    fields: UpsPreferenceFields,
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (fields.notificationEmail !== undefined)
      body.notification_email = fields.notificationEmail;
    if (fields.notificationSms !== undefined)
      body.notification_sms = fields.notificationSms;
    if (fields.notificationWhatsapp !== undefined)
      body.notification_whatsapp = fields.notificationWhatsapp;
    if (fields.language !== undefined) body.language = fields.language;
    if (fields.timezone !== undefined) body.timezone = fields.timezone;
    await this.http.request(
      `/api/v1/users/${encodeURIComponent(userId)}/ups-profile/preferences`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
  }
}
