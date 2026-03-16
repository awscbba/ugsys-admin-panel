import { useState } from "react";
import type { AdminUser } from "../../../domain/entities/AdminUser";
import type { ProfileUpdateFields } from "../../../domain/repositories/UserManagementRepository";
import type { UpsProfile } from "../../../domain/entities/UpsProfile";
import type {
  UpsPersonalFields,
  UpsContactFields,
  UpsDisplayFields,
  UpsPreferenceFields,
} from "../../../domain/repositories/UserProfileClient";

export interface EditProfileModalProps {
  user: AdminUser;
  isSuperAdmin: boolean;
  onSuccess: () => void;
  onClose: () => void;
  onSave: (userId: string, fields: ProfileUpdateFields) => Promise<void>;
  // UPS extension
  upsProfile?: UpsProfile | null;
  onSavePersonal?: (userId: string, fields: UpsPersonalFields) => Promise<void>;
  onSaveContact?: (userId: string, fields: UpsContactFields) => Promise<void>;
  onSaveDisplay?: (userId: string, fields: UpsDisplayFields) => Promise<void>;
  onSavePreferences?: (
    userId: string,
    fields: UpsPreferenceFields,
  ) => Promise<void>;
}

interface FieldErrors {
  displayName?: string;
  email?: string;
  password?: string;
  // UPS
  fullName?: string;
  dateOfBirth?: string;
  bio?: string;
  language?: string;
}

interface SectionErrors {
  personal?: string;
  contact?: string;
  display?: string;
  preferences?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LANG_RE = /^[a-z]{2}$/;
const BIO_MAX = 500;

// ── computeUpsDiff ────────────────────────────────────────────────────────────

interface UpsDiff {
  personal?: UpsPersonalFields;
  contact?: UpsContactFields;
  display?: UpsDisplayFields;
  preferences?: UpsPreferenceFields;
}

export function computeUpsDiff(
  initial: UpsProfile | null | undefined,
  state: {
    fullName: string;
    dateOfBirth: string;
    phone: string;
    street: string;
    city: string;
    upsState: string;
    postalCode: string;
    country: string;
    bio: string;
    upsDisplayName: string;
    notificationEmail: boolean;
    notificationSms: boolean;
    notificationWhatsapp: boolean;
    language: string;
    timezone: string;
  },
): UpsDiff {
  const diff: UpsDiff = {};

  // Personal
  const pFields: UpsPersonalFields = {};
  if (state.fullName !== (initial?.fullName ?? ""))
    pFields.fullName = state.fullName;
  if (state.dateOfBirth !== (initial?.dateOfBirth ?? ""))
    pFields.dateOfBirth = state.dateOfBirth;
  if (Object.keys(pFields).length > 0) diff.personal = pFields;

  // Contact
  const cFields: UpsContactFields = {};
  if (state.phone !== (initial?.phone ?? "")) cFields.phone = state.phone;
  if (state.street !== (initial?.street ?? "")) cFields.street = state.street;
  if (state.city !== (initial?.city ?? "")) cFields.city = state.city;
  if (state.upsState !== (initial?.state ?? "")) cFields.state = state.upsState;
  if (state.postalCode !== (initial?.postalCode ?? ""))
    cFields.postalCode = state.postalCode;
  if (state.country !== (initial?.country ?? ""))
    cFields.country = state.country;
  if (Object.keys(cFields).length > 0) diff.contact = cFields;

  // Display
  const dFields: UpsDisplayFields = {};
  if (state.bio !== (initial?.bio ?? "")) dFields.bio = state.bio;
  if (state.upsDisplayName !== (initial?.displayName ?? ""))
    dFields.displayName = state.upsDisplayName;
  if (Object.keys(dFields).length > 0) diff.display = dFields;

  // Preferences
  const prefFields: UpsPreferenceFields = {};
  if (state.notificationEmail !== (initial?.notificationEmail ?? false))
    prefFields.notificationEmail = state.notificationEmail;
  if (state.notificationSms !== (initial?.notificationSms ?? false))
    prefFields.notificationSms = state.notificationSms;
  if (state.notificationWhatsapp !== (initial?.notificationWhatsapp ?? false))
    prefFields.notificationWhatsapp = state.notificationWhatsapp;
  if (state.language !== (initial?.language ?? ""))
    prefFields.language = state.language;
  if (state.timezone !== (initial?.timezone ?? ""))
    prefFields.timezone = state.timezone;
  if (Object.keys(prefFields).length > 0) diff.preferences = prefFields;

  return diff;
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabButton({
  label,
  active,
  hasError,
  onClick,
}: {
  label: string;
  active: boolean;
  hasError: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-has-error={hasError ? "true" : "false"}
      onClick={onClick}
      style={{
        padding: "8px 18px",
        border: "none",
        borderBottom: active ? "2px solid #6366f1" : "2px solid transparent",
        background: "none",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: active ? 700 : 500,
        color: hasError ? "#dc2626" : active ? "#6366f1" : "#374151",
      }}
    >
      {label}
      {hasError ? " !" : ""}
    </button>
  );
}

// ── Section error banner ──────────────────────────────────────────────────────

function SectionBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        marginBottom: "12px",
        padding: "8px 12px",
        background: "#fef2f2",
        border: "1px solid #fca5a5",
        borderRadius: "6px",
        fontSize: "13px",
        color: "#b91c1c",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss error"
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#b91c1c",
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <label
        htmlFor={htmlFor}
        style={{
          display: "block",
          fontSize: "13px",
          marginBottom: "4px",
          color: "#374151",
          fontWeight: 500,
        }}
      >
        {label}
      </label>
      {children}
      {error && (
        <p style={{ color: "#ef4444", fontSize: "12px", margin: "4px 0 0" }}>
          {error}
        </p>
      )}
    </div>
  );
}

const inputStyle = (hasError: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "8px 10px",
  boxSizing: "border-box",
  border: `1px solid ${hasError ? "#ef4444" : "#d1d5db"}`,
  borderRadius: "6px",
  fontSize: "14px",
});

// ── Main component ────────────────────────────────────────────────────────────

export function EditProfileModal({
  user,
  isSuperAdmin,
  onSuccess,
  onClose,
  onSave,
  upsProfile,
  onSavePersonal,
  onSaveContact,
  onSaveDisplay,
  onSavePreferences,
}: EditProfileModalProps) {
  // Identity tab state
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");

  // UPS tab state
  const [fullName, setFullName] = useState(upsProfile?.fullName ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(upsProfile?.dateOfBirth ?? "");
  const [phone, setPhone] = useState(upsProfile?.phone ?? "");
  const [street, setStreet] = useState(upsProfile?.street ?? "");
  const [city, setCity] = useState(upsProfile?.city ?? "");
  const [upsState, setUpsState] = useState(upsProfile?.state ?? "");
  const [postalCode, setPostalCode] = useState(upsProfile?.postalCode ?? "");
  const [country, setCountry] = useState(upsProfile?.country ?? "");
  const [bio, setBio] = useState(upsProfile?.bio ?? "");
  const [upsDisplayName, setUpsDisplayName] = useState(
    upsProfile?.displayName ?? "",
  );
  const [notificationEmail, setNotificationEmail] = useState(
    upsProfile?.notificationEmail ?? false,
  );
  const [notificationSms, setNotificationSms] = useState(
    upsProfile?.notificationSms ?? false,
  );
  const [notificationWhatsapp, setNotificationWhatsapp] = useState(
    upsProfile?.notificationWhatsapp ?? false,
  );
  const [language, setLanguage] = useState(upsProfile?.language ?? "");
  const [timezone, setTimezone] = useState(upsProfile?.timezone ?? "");

  // UI state
  const [activeTab, setActiveTab] = useState<"identity" | "profile">(
    "identity",
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sectionErrors, setSectionErrors] = useState<SectionErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasUps = !!onSavePersonal;
  const profileTabHasError = !!(
    errors.fullName ||
    errors.dateOfBirth ||
    errors.bio ||
    errors.language
  );
  const identityTabHasError = !!(
    errors.displayName ||
    errors.email ||
    errors.password
  );

  // ── Validation ──────────────────────────────────────────────────────────

  function validate(): boolean {
    const e: FieldErrors = {};

    // Identity
    if (!displayName.trim()) e.displayName = "Display name is required.";
    if (isSuperAdmin && email && !EMAIL_RE.test(email))
      e.email = "Enter a valid email address.";
    if (isSuperAdmin && password && password.length < 8)
      e.password = "Password must be at least 8 characters.";

    // UPS — only validate if UPS props provided
    if (hasUps) {
      if (fullName.trim() === "" && fullName !== "")
        e.fullName = "Full name is required.";
      if (fullName !== "" && !fullName.trim())
        e.fullName = "Full name is required.";
      if (dateOfBirth && !DATE_RE.test(dateOfBirth))
        e.dateOfBirth = "Date must be in YYYY-MM-DD format.";
      if (bio.length > BIO_MAX)
        e.bio = `Bio must be ${BIO_MAX} characters or fewer.`;
      if (language && !LANG_RE.test(language))
        e.language = "Language must be a 2-letter code (e.g. en, es).";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Save ────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setBanner(null);
    setSectionErrors({});

    try {
      // Identity save
      const identityFields: ProfileUpdateFields = {};
      if (displayName.trim() !== (user.displayName ?? ""))
        identityFields.displayName = displayName.trim();
      if (isSuperAdmin && email !== (user.email ?? ""))
        identityFields.email = email;
      if (isSuperAdmin && password) identityFields.password = password;
      if (Object.keys(identityFields).length === 0)
        identityFields.displayName = displayName.trim();
      await onSave(user.userId, identityFields);

      // UPS saves — diff-only, concurrent via Promise.allSettled
      if (hasUps) {
        const upsFieldState = {
          fullName,
          dateOfBirth,
          phone,
          street,
          city,
          upsState,
          postalCode,
          country,
          bio,
          upsDisplayName,
          notificationEmail,
          notificationSms,
          notificationWhatsapp,
          language,
          timezone,
        };
        const diff = computeUpsDiff(upsProfile, upsFieldState);

        const calls: Array<Promise<void>> = [];
        const keys: Array<keyof SectionErrors> = [];

        if (diff.personal && onSavePersonal) {
          calls.push(onSavePersonal(user.userId, diff.personal));
          keys.push("personal");
        }
        if (diff.contact && onSaveContact) {
          calls.push(onSaveContact(user.userId, diff.contact));
          keys.push("contact");
        }
        if (diff.display && onSaveDisplay) {
          calls.push(onSaveDisplay(user.userId, diff.display));
          keys.push("display");
        }
        if (diff.preferences && onSavePreferences) {
          calls.push(onSavePreferences(user.userId, diff.preferences));
          keys.push("preferences");
        }

        if (calls.length > 0) {
          const results = await Promise.allSettled(calls);
          const newSectionErrors: SectionErrors = {};
          results.forEach((result, i) => {
            if (result.status === "rejected") {
              const msg =
                result.reason instanceof Error
                  ? result.reason.message
                  : "An unexpected error occurred.";
              newSectionErrors[keys[i]] = msg;
            }
          });
          if (Object.keys(newSectionErrors).length > 0) {
            setSectionErrors(newSectionErrors);
            return; // modal stays open
          }
        }
      }

      onSuccess();
      onClose();
    } catch (err) {
      setBanner(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-profile-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "10px",
          padding: "28px",
          width: hasUps ? "520px" : "400px",
          maxWidth: "90vw",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h3
          id="edit-profile-title"
          style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 700 }}
        >
          Edit Profile
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#4b5563" }}>
          {user.displayName || user.email}
        </p>

        {/* Global error banner */}
        {banner && (
          <div
            role="alert"
            style={{
              marginBottom: "16px",
              padding: "10px 14px",
              background: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: "6px",
              fontSize: "13px",
              color: "#b91c1c",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{banner}</span>
            <button
              aria-label="Dismiss error"
              onClick={() => setBanner(null)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#b91c1c",
                marginLeft: "8px",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Tabs — only shown when UPS props provided */}
        {hasUps && (
          <div
            role="tablist"
            style={{
              display: "flex",
              borderBottom: "1px solid #e5e7eb",
              marginBottom: "20px",
            }}
          >
            <TabButton
              label="Identity"
              active={activeTab === "identity"}
              hasError={identityTabHasError}
              onClick={() => setActiveTab("identity")}
            />
            <TabButton
              label="Profile"
              active={activeTab === "profile"}
              hasError={profileTabHasError}
              onClick={() => setActiveTab("profile")}
            />
          </div>
        )}

        {/* ── Identity tab ── */}
        {(!hasUps || activeTab === "identity") && (
          <div>
            <Field
              label="Display Name"
              htmlFor="edit-display-name"
              error={errors.displayName}
            >
              <input
                id="edit-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={saving}
                style={inputStyle(!!errors.displayName)}
              />
            </Field>

            <div style={{ marginBottom: "14px" }}>
              <label
                htmlFor="edit-email"
                style={{
                  display: "block",
                  fontSize: "13px",
                  marginBottom: "4px",
                }}
              >
                Email
                {!isSuperAdmin && (
                  <span
                    style={{
                      color: "#9ca3af",
                      marginLeft: "6px",
                      fontSize: "12px",
                    }}
                  >
                    (read-only)
                  </span>
                )}
              </label>
              <input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={!isSuperAdmin}
                disabled={saving}
                style={{
                  ...inputStyle(!!errors.email),
                  background: !isSuperAdmin ? "#f9fafb" : "#fff",
                  color: !isSuperAdmin ? "#6b7280" : "#111827",
                }}
              />
              {errors.email && (
                <p
                  style={{
                    color: "#ef4444",
                    fontSize: "12px",
                    margin: "4px 0 0",
                  }}
                >
                  {errors.email}
                </p>
              )}
            </div>

            {isSuperAdmin && (
              <Field
                label="New Password"
                htmlFor="edit-password"
                error={errors.password}
              >
                <input
                  id="edit-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={saving}
                  placeholder="Leave blank to keep current"
                  style={inputStyle(!!errors.password)}
                />
              </Field>
            )}
            {!isSuperAdmin && <div style={{ marginBottom: "8px" }} />}
          </div>
        )}

        {/* ── Profile tab ── */}
        {hasUps && activeTab === "profile" && (
          <div>
            {/* Personal */}
            <p
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#374151",
                textTransform: "uppercase",
                margin: "0 0 10px",
              }}
            >
              Personal
            </p>
            {sectionErrors.personal && (
              <SectionBanner
                message={sectionErrors.personal}
                onDismiss={() =>
                  setSectionErrors((s) => ({ ...s, personal: undefined }))
                }
              />
            )}
            <Field
              label="Full Name"
              htmlFor="ups-full-name"
              error={errors.fullName}
            >
              <input
                id="ups-full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={saving}
                style={inputStyle(!!errors.fullName)}
              />
            </Field>
            <Field
              label="Date of Birth"
              htmlFor="ups-dob"
              error={errors.dateOfBirth}
            >
              <input
                id="ups-dob"
                type="text"
                value={dateOfBirth}
                placeholder="YYYY-MM-DD"
                onChange={(e) => setDateOfBirth(e.target.value)}
                disabled={saving}
                style={inputStyle(!!errors.dateOfBirth)}
              />
            </Field>

            {/* Contact */}
            <p
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#374151",
                textTransform: "uppercase",
                margin: "16px 0 10px",
              }}
            >
              Contact
            </p>
            {sectionErrors.contact && (
              <SectionBanner
                message={sectionErrors.contact}
                onDismiss={() =>
                  setSectionErrors((s) => ({ ...s, contact: undefined }))
                }
              />
            )}
            <Field label="Phone" htmlFor="ups-phone">
              <input
                id="ups-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={saving}
                style={inputStyle(false)}
              />
            </Field>
            <Field label="Street" htmlFor="ups-street">
              <input
                id="ups-street"
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                disabled={saving}
                style={inputStyle(false)}
              />
            </Field>
            <Field label="City" htmlFor="ups-city">
              <input
                id="ups-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={saving}
                style={inputStyle(false)}
              />
            </Field>
            <Field label="State" htmlFor="ups-state">
              <input
                id="ups-state"
                type="text"
                value={upsState}
                onChange={(e) => setUpsState(e.target.value)}
                disabled={saving}
                style={inputStyle(false)}
              />
            </Field>
            <Field label="Postal Code" htmlFor="ups-postal">
              <input
                id="ups-postal"
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                disabled={saving}
                style={inputStyle(false)}
              />
            </Field>
            <Field label="Country" htmlFor="ups-country">
              <input
                id="ups-country"
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={saving}
                style={inputStyle(false)}
              />
            </Field>

            {/* Display */}
            <p
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#374151",
                textTransform: "uppercase",
                margin: "16px 0 10px",
              }}
            >
              Display
            </p>
            {sectionErrors.display && (
              <SectionBanner
                message={sectionErrors.display}
                onDismiss={() =>
                  setSectionErrors((s) => ({ ...s, display: undefined }))
                }
              />
            )}
            <Field label="Bio" htmlFor="ups-bio" error={errors.bio}>
              <textarea
                id="ups-bio"
                value={bio}
                rows={3}
                onChange={(e) => setBio(e.target.value)}
                disabled={saving}
                style={{
                  ...inputStyle(!!errors.bio),
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
              <p
                style={{
                  fontSize: "12px",
                  color: bio.length > BIO_MAX ? "#ef4444" : "#4b5563",
                  margin: "2px 0 0",
                }}
              >
                {BIO_MAX - bio.length} characters remaining
              </p>
            </Field>
            <Field label="Display Name" htmlFor="ups-display-name">
              <input
                id="ups-display-name"
                type="text"
                value={upsDisplayName}
                onChange={(e) => setUpsDisplayName(e.target.value)}
                disabled={saving}
                style={inputStyle(false)}
              />
            </Field>

            {/* Preferences */}
            <p
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#374151",
                textTransform: "uppercase",
                margin: "16px 0 10px",
              }}
            >
              Preferences
            </p>
            {sectionErrors.preferences && (
              <SectionBanner
                message={sectionErrors.preferences}
                onDismiss={() =>
                  setSectionErrors((s) => ({ ...s, preferences: undefined }))
                }
              />
            )}
            <div
              style={{
                marginBottom: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "14px",
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.checked)}
                  disabled={saving}
                />
                Email notifications
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "14px",
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={notificationSms}
                  onChange={(e) => setNotificationSms(e.target.checked)}
                  disabled={saving}
                />
                SMS notifications
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "14px",
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={notificationWhatsapp}
                  onChange={(e) => setNotificationWhatsapp(e.target.checked)}
                  disabled={saving}
                />
                WhatsApp notifications
              </label>
            </div>
            <Field
              label="Language"
              htmlFor="ups-language"
              error={errors.language}
            >
              <input
                id="ups-language"
                type="text"
                value={language}
                placeholder="e.g. en, es"
                onChange={(e) => setLanguage(e.target.value)}
                disabled={saving}
                style={inputStyle(!!errors.language)}
              />
            </Field>
            <Field label="Timezone" htmlFor="ups-timezone">
              <input
                id="ups-timezone"
                type="text"
                value={timezone}
                placeholder="e.g. America/La_Paz"
                onChange={(e) => setTimezone(e.target.value)}
                disabled={saving}
                style={inputStyle(false)}
              />
            </Field>
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            marginTop: "8px",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "8px 18px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              background: "#fff",
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: "14px",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            aria-label="Save"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 18px",
              border: "none",
              borderRadius: "6px",
              background: saving ? "#9ca3af" : "#161d2b",
              color: "#fff",
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: "14px",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
