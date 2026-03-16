import { useRef, useState } from "react";
import type { AdminUser } from "../../../domain/entities/AdminUser";
import { ProfileDropdown } from "./ProfileDropdown";
import { SelfEditProfileModal } from "../modals/SelfEditProfileModal";
import { useSectionTitle } from "../../hooks/useSectionTitle";

interface TopBarProps {
  user: AdminUser;
  onLogout: () => void;
}

/**
 * TopBar — profile trigger, dropdown, and self-edit modal.
 *
 * Requirements: 8.1, 8.2
 */
export function TopBar({ user, onLogout }: TopBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sectionTitle = useSectionTitle();

  const initials = (user.displayName || user.email || "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="flex items-center justify-between gap-3 px-6 h-14 border-b border-white/10 bg-primary text-white shrink-0">
      {/* Section title — left-aligned, announces route changes to screen readers */}
      <span aria-live="polite" className="text-sm font-medium text-gray-200">
        {sectionTitle}
      </span>

      {/* Profile trigger */}
      <button
        ref={triggerRef}
        aria-label={user.displayName || user.email}
        aria-haspopup="true"
        aria-expanded={dropdownOpen}
        onClick={() => setDropdownOpen((o) => !o)}
        className="flex items-center gap-2 cursor-pointer bg-transparent border-none text-white hover:opacity-80 transition-opacity"
      >
        <span className="text-sm text-gray-300">{user.displayName}</span>
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.displayName}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand text-primary text-[13px] font-semibold select-none">
            {initials}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <ProfileDropdown
          triggerRef={triggerRef}
          onClose={() => setDropdownOpen(false)}
          onEditProfile={() => {
            setDropdownOpen(false);
            setEditModalOpen(true);
          }}
          onLogout={onLogout}
        />
      )}

      {editModalOpen && (
        <SelfEditProfileModal
          user={user}
          onClose={() => setEditModalOpen(false)}
        />
      )}
    </header>
  );
}
