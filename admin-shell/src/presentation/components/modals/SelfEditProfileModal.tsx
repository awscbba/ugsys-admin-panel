import { useState } from "react";
import type { AdminUser } from "../../../domain/entities/AdminUser";
import { updateOwnProfile } from "../../../stores/authStore";

interface Props {
  user: AdminUser;
  onClose: () => void;
}

/**
 * SelfEditProfileModal — self-service profile edit dialog.
 *
 * Fields: display_name (pre-populated), new_password, confirm_password.
 * Validates before submit; only sends changed fields (P3).
 * Closes on 204; shows dismissible error banner on failure.
 * Save/Cancel disabled while saving.
 *
 * Requirements: 7.1, 7.2, 7.3
 */
export function SelfEditProfileModal({ user, onClose }: Props) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!displayName.trim()) {
      e.displayName = "Display name is required.";
    } else if (displayName.trim().length > 100) {
      e.displayName = "Display name must be 100 characters or fewer.";
    }
    if (newPassword && newPassword.length < 8) {
      e.newPassword = "Password must be at least 8 characters.";
    }
    if (newPassword && newPassword !== confirmPassword) {
      e.confirmPassword = "Passwords do not match.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setBanner(null);
    try {
      const fields: { displayName?: string; password?: string } = {};
      // P3 — only send changed fields
      if (displayName.trim() !== user.displayName) {
        fields.displayName = displayName.trim();
      }
      if (newPassword) {
        fields.password = newPassword;
      }
      await updateOwnProfile(fields);
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
      aria-labelledby="self-edit-title"
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
          id="self-edit-title"
          style={{ margin: "0 0 20px", fontSize: "16px", fontWeight: 700 }}
        >
          Edit Profile
        </h3>

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
            htmlFor="self-edit-display-name"
            style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}
          >
            Display Name
          </label>
          <input
            id="self-edit-display-name"
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

        {/* New password */}
        <div style={{ marginBottom: "16px" }}>
          <label
            htmlFor="self-edit-new-password"
            style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}
          >
            New Password
          </label>
          <input
            id="self-edit-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={saving}
            placeholder="Leave blank to keep current"
            style={{
              width: "100%",
              padding: "8px 10px",
              border: errors.newPassword
                ? "1px solid #ef4444"
                : "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
          {errors.newPassword && (
            <p
              style={{ color: "#ef4444", fontSize: "12px", margin: "4px 0 0" }}
            >
              {errors.newPassword}
            </p>
          )}
        </div>

        {/* Confirm password */}
        <div style={{ marginBottom: "24px" }}>
          <label
            htmlFor="self-edit-confirm-password"
            style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}
          >
            Confirm Password
          </label>
          <input
            id="self-edit-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={saving}
            style={{
              width: "100%",
              padding: "8px 10px",
              border: errors.confirmPassword
                ? "1px solid #ef4444"
                : "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
          {errors.confirmPassword && (
            <p
              style={{ color: "#ef4444", fontSize: "12px", margin: "4px 0 0" }}
            >
              {errors.confirmPassword}
            </p>
          )}
        </div>

        {/* Actions */}
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
        >
          <button
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
