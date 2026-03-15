import { useState } from "react";
import type { AdminUser } from "../../../domain/entities/AdminUser";
import type { ProfileUpdateFields } from "../../../domain/repositories/UserManagementRepository";

export interface EditProfileModalProps {
  /** The user whose profile is being edited. */
  user: AdminUser;
  /** Whether the acting admin is a super_admin (unlocks email + password fields). */
  isSuperAdmin: boolean;
  /** Called when the save succeeds. */
  onSuccess: () => void;
  onClose: () => void;
  /** Async function that calls the repository. Injected for testability. */
  onSave: (userId: string, fields: ProfileUpdateFields) => Promise<void>;
}

interface FieldErrors {
  displayName?: string;
  email?: string;
  password?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * EditProfileModal — admin-on-other-user profile editor.
 *
 * Fields:
 *   display_name — always editable, pre-populated
 *   email        — pre-populated; read-only for admin, editable for super_admin
 *   password     — empty; hidden for admin, shown for super_admin
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */
export function EditProfileModal({
  user,
  isSuperAdmin,
  onSuccess,
  onClose,
  onSave,
}: EditProfileModalProps) {
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function validate(): boolean {
    const e: FieldErrors = {};
    if (!displayName.trim()) {
      e.displayName = "Display name is required.";
    }
    if (isSuperAdmin && email && !EMAIL_RE.test(email)) {
      e.email = "Enter a valid email address.";
    }
    if (isSuperAdmin && password && password.length < 8) {
      e.password = "Password must be at least 8 characters.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setBanner(null);
    try {
      // Build diff — only send changed fields
      const fields: ProfileUpdateFields = {};
      if (displayName.trim() !== (user.displayName ?? "")) {
        fields.displayName = displayName.trim();
      }
      if (isSuperAdmin && email !== (user.email ?? "")) {
        fields.email = email;
      }
      if (isSuperAdmin && password) {
        fields.password = password;
      }
      // Always send at least displayName if nothing else changed
      if (Object.keys(fields).length === 0) {
        fields.displayName = displayName.trim();
      }
      await onSave(user.userId, fields);
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
          width: "400px",
          maxWidth: "90vw",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <h3
          id="edit-profile-title"
          style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 700 }}
        >
          Edit Profile
        </h3>
        <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#6b7280" }}>
          {user.displayName || user.email}
        </p>

        {/* Error banner */}
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

        {/* Display name */}
        <div style={{ marginBottom: "16px" }}>
          <label
            htmlFor="edit-display-name"
            style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}
          >
            Display Name
          </label>
          <input
            id="edit-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={saving}
            style={{
              width: "100%",
              padding: "8px 10px",
              border: errors.displayName
                ? "1px solid #ef4444"
                : "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
          {errors.displayName && (
            <p
              style={{ color: "#ef4444", fontSize: "12px", margin: "4px 0 0" }}
            >
              {errors.displayName}
            </p>
          )}
        </div>

        {/* Email — always shown; read-only for admin */}
        <div style={{ marginBottom: "16px" }}>
          <label
            htmlFor="edit-email"
            style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}
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
              width: "100%",
              padding: "8px 10px",
              border: errors.email ? "1px solid #ef4444" : "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
              boxSizing: "border-box",
              background: !isSuperAdmin ? "#f9fafb" : "#fff",
              color: !isSuperAdmin ? "#6b7280" : "#111827",
            }}
          />
          {errors.email && (
            <p
              style={{ color: "#ef4444", fontSize: "12px", margin: "4px 0 0" }}
            >
              {errors.email}
            </p>
          )}
        </div>

        {/* Password — super_admin only */}
        {isSuperAdmin && (
          <div style={{ marginBottom: "24px" }}>
            <label
              htmlFor="edit-password"
              style={{
                display: "block",
                fontSize: "13px",
                marginBottom: "4px",
              }}
            >
              New Password
            </label>
            <input
              id="edit-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
              placeholder="Leave blank to keep current"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: errors.password
                  ? "1px solid #ef4444"
                  : "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
            {errors.password && (
              <p
                style={{
                  color: "#ef4444",
                  fontSize: "12px",
                  margin: "4px 0 0",
                }}
              >
                {errors.password}
              </p>
            )}
          </div>
        )}

        {/* Spacer when password field is hidden */}
        {!isSuperAdmin && <div style={{ marginBottom: "8px" }} />}

        {/* Actions */}
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
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
