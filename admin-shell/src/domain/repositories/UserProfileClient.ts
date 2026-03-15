/**
 * UserProfileClient — outbound port for UPS profile operations.
 *
 * Requirements: 1.6, 3.5, 4.4, 5.5, 6.5, 14.3
 */
import type { UpsProfile } from "../entities/UpsProfile";

export interface UpsPersonalFields {
  fullName?: string;
  dateOfBirth?: string; // YYYY-MM-DD
}

export interface UpsContactFields {
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface UpsDisplayFields {
  bio?: string;
  displayName?: string;
}

export interface UpsPreferenceFields {
  notificationEmail?: boolean;
  notificationSms?: boolean;
  notificationWhatsapp?: boolean;
  language?: string;
  timezone?: string;
}

export interface UserProfileClient {
  getProfile(userId: string): Promise<UpsProfile>;
  updatePersonal(userId: string, fields: UpsPersonalFields): Promise<void>;
  updateContact(userId: string, fields: UpsContactFields): Promise<void>;
  updateDisplay(userId: string, fields: UpsDisplayFields): Promise<void>;
  updatePreferences(userId: string, fields: UpsPreferenceFields): Promise<void>;
}
