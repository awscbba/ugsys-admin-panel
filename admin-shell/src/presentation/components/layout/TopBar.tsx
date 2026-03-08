import type { AdminUser } from "../../../domain/entities/AdminUser";

interface TopBarProps {
  user: AdminUser;
  onLogout: () => void;
}

/**
 * TopBar — displays the authenticated user's display name, avatar, and a logout button.
 *
 * Uses Design_Tokens via Tailwind utility classes:
 *   bg-primary  (#161d2b) — topbar background
 *   text-brand  (#FF9900) — avatar fallback accent
 *
 * Requirements: 1.3, 8.4
 */
export function TopBar({ user, onLogout }: TopBarProps) {
  const initials = (user.displayName || user.email || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="flex items-center justify-end gap-3 px-6 h-14 border-b border-white/10 bg-primary text-white shrink-0">
      <span className="text-sm text-gray-300">{user.displayName}</span>

      {user.avatar ? (
        <img
          src={user.avatar}
          alt={user.displayName}
          className="w-8 h-8 rounded-full object-cover"
        />
      ) : (
        <span
          aria-label={`Avatar for ${user.displayName}`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand text-primary text-[13px] font-semibold select-none"
        >
          {initials}
        </span>
      )}

      <button
        onClick={onLogout}
        className="px-3.5 py-1.5 text-[13px] cursor-pointer border border-white/20 rounded-md bg-transparent text-gray-200 hover:bg-white/10 transition-colors"
      >
        Logout
      </button>
    </header>
  );
}
