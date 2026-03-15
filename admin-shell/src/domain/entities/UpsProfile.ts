/**
 * UpsProfile — User Profile Service extended profile fields.
 *
 * All fields are optional — a profile may be partially populated.
 * camelCase on the frontend; snake_case on the wire (mapped in HttpUserProfileClient).
 *
 * Requirements: 1.6, 3.5, 4.4, 5.5, 6.5, 14.3
 */
export interface UpsProfile {
  userId: string;
  // Personal
  fullName: string | null;
  dateOfBirth: string | null; // YYYY-MM-DD
  // Contact
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  // Display
  bio: string | null;
  displayName: string | null;
  // Preferences
  notificationEmail: boolean | null;
  notificationSms: boolean | null;
  notificationWhatsapp: boolean | null;
  language: string | null;
  timezone: string | null;
}
