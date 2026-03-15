import { useEffect, useRef } from "react";

interface ProfileDropdownProps {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onEditProfile: () => void;
  onLogout: () => void;
}

/**
 * ProfileDropdown — ARIA menu with two items: "Edit Profile" and "Logout".
 *
 * Accessibility:
 * - role="menu" on the container
 * - role="menuitem" on each button
 * - Click-outside dismissal
 * - Escape key dismissal with focus returned to trigger
 * - Up/Down Arrow key navigation cycles between items
 */
export function ProfileDropdown({
  triggerRef,
  onClose,
  onEditProfile,
  onLogout,
}: ProfileDropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={handleKeyDown}
      className="absolute right-4 top-14 z-50 w-44 bg-white rounded-lg shadow-lg border border-gray-100 py-1"
    >
      <button
        role="menuitem"
        onClick={onEditProfile}
        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:bg-gray-50"
      >
        Edit Profile
      </button>
      <button
        role="menuitem"
        onClick={onLogout}
        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:bg-gray-50"
      >
        Logout
      </button>
    </div>
  );
}
