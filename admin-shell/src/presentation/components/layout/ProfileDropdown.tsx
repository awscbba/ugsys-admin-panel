import { useEffect, useRef, useState } from "react";
import { useTheme } from "@ugsys/ui-lib";

const menuItemBaseStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "8px 16px",
  fontSize: "14px",
  color: "var(--color-text-secondary)",
  background: "none",
  border: "none",
  cursor: "pointer",
};

function DropdownMenuItem({
  onClick,
  ariaLabel,
  style,
  children,
}: {
  onClick: () => void;
  ariaLabel?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      role="menuitem"
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        ...menuItemBaseStyle,
        ...style,
        background: hovered ? "var(--color-surface-elevated)" : "none",
      }}
    >
      {children}
    </button>
  );
}

interface ProfileDropdownProps {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onEditProfile: () => void;
  onLogout: () => void;
}

/**
 * ProfileDropdown — ARIA menu with three items: "Edit Profile", theme toggle, and "Logout".
 *
 * Accessibility:
 * - role="menu" on the container
 * - role="menuitem" on each button
 * - Click-outside dismissal
 * - Escape key dismissal with focus returned to trigger
 * - Up/Down Arrow key navigation cycles between items
 * - Theme toggle has descriptive aria-label
 */
export function ProfileDropdown({
  triggerRef,
  onClose,
  onEditProfile,
  onLogout,
}: ProfileDropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();

  // Click-outside dismissal
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, triggerRef]);

  // Escape key dismissal — return focus to trigger
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, triggerRef]);

  // Up/Down Arrow key navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    const items =
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!items || items.length === 0) return;
    const idx = Array.from(items).indexOf(
      document.activeElement as HTMLElement,
    );
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    }
  }

  const isLight = theme === "light";

  return (
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={handleKeyDown}
      style={{
        position: "absolute",
        right: "16px",
        top: "56px",
        zIndex: 50,
        width: "176px",
        background: "var(--color-surface)",
        borderRadius: "8px",
        boxShadow:
          "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
        border: "1px solid var(--color-border)",
        padding: "4px 0",
      }}
    >
      <DropdownMenuItem onClick={onEditProfile}>Edit Profile</DropdownMenuItem>
      <DropdownMenuItem
        ariaLabel={isLight ? "Switch to dark theme" : "Switch to light theme"}
        onClick={toggleTheme}
        style={{ display: "flex", alignItems: "center", gap: "8px" }}
      >
        {isLight ? (
          <>
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            Dark
          </>
        ) : (
          <>
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            Light
          </>
        )}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onLogout}>Logout</DropdownMenuItem>
    </div>
  );
}
