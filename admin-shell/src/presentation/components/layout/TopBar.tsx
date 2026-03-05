import type { AdminUser } from '../../../domain/entities/AdminUser';

interface TopBarProps {
  user: AdminUser;
  onLogout: () => void;
}

/**
 * TopBar — displays the authenticated user's display name, avatar, and a logout button.
 *
 * Requirements: 1.3
 */
export function TopBar({ user, onLogout }: TopBarProps) {
  const initials = user.displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '12px',
        padding: '0 24px',
        height: '56px',
        borderBottom: '1px solid #e5e7eb',
        background: '#fff',
      }}
    >
      <span style={{ fontSize: '14px', color: '#374151' }}>{user.displayName}</span>

      {user.avatar ? (
        <img
          src={user.avatar}
          alt={user.displayName}
          style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <span
          aria-label={`Avatar for ${user.displayName}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: '#6366f1',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          {initials}
        </span>
      )}

      <button
        onClick={onLogout}
        style={{
          padding: '6px 14px',
          fontSize: '13px',
          cursor: 'pointer',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          background: '#fff',
          color: '#374151',
        }}
      >
        Logout
      </button>
    </header>
  );
}
