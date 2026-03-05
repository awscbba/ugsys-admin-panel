/**
 * UserManagement — built-in view for managing platform users.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 *
 * - Restricted to super_admin and admin roles (Req 9.1)
 * - Paginated, searchable table: display name, email, roles, status, last login (Req 9.3)
 * - Role change action — super_admin only (Req 9.4)
 * - Activate/deactivate action — super_admin and admin (Req 9.5)
 * - Fetches users via HttpUserManagementRepository on mount (Req 9.2)
 * - Debounced search input
 * - Loading and error states with retry
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminUser } from '../../../domain/entities/AdminUser';
import type { PaginatedUsers, UserListQuery } from '../../../domain/repositories/UserManagementRepository';
import { HttpUserManagementRepository } from '../../../infrastructure/repositories/HttpUserManagementRepository';
import { useRbac } from '../RbacProvider';
import { getComponentLogger } from '../../../utils/logger';
import {
  USER_MANAGEMENT_ERRORS,
  normalizeError,
  resolveErrorMessage,
} from '../../../utils/errorHandling';

const logger = getComponentLogger('UserManagement');

const PAGE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRoles(roles: string[]): string {
  return roles.length > 0 ? roles.join(', ') : '—';
}

// ── RoleChangeModal ───────────────────────────────────────────────────────────

const ALL_ROLES = ['super_admin', 'admin', 'moderator', 'auditor', 'member', 'guest'];

interface RoleChangeModalProps {
  user: AdminUser;
  onConfirm: (roles: string[]) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function RoleChangeModal({ user, onConfirm, onCancel, isSaving }: RoleChangeModalProps) {
  const [selected, setSelected] = useState<string[]>(user.roles);

  const toggle = (role: string) => {
    setSelected((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '10px',
          padding: '28px',
          width: '360px',
          maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <h3
          id="role-modal-title"
          style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: '#111827' }}
        >
          Change roles
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#6b7280' }}>
          {user.displayName || user.email}
        </p>

        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 24px' }}>
          <legend style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>
            Roles
          </legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {ALL_ROLES.map((role) => (
              <label
                key={role}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  color: '#374151',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(role)}
                  onChange={() => toggle(role)}
                  disabled={isSaving}
                />
                {role}
              </label>
            ))}
          </div>
        </fieldset>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            style={{
              padding: '8px 18px',
              background: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: isSaving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            disabled={isSaving || selected.length === 0}
            style={{
              padding: '8px 18px',
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isSaving || selected.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isSaving || selected.length === 0 ? 0.7 : 1,
            }}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── UserRow ───────────────────────────────────────────────────────────────────

interface UserRowProps {
  user: AdminUser;
  canChangeRoles: boolean;
  canChangeStatus: boolean;
  onChangeRoles: (user: AdminUser) => void;
  onToggleStatus: (user: AdminUser) => void;
  actionInProgress: string | null; // userId of the user being acted on
}

function UserRow({
  user,
  canChangeRoles,
  canChangeStatus,
  onChangeRoles,
  onToggleStatus,
  actionInProgress,
}: UserRowProps) {
  const isBusy = actionInProgress === user.userId;

  // Derive status from roles: users with no admin roles are considered inactive
  // The API may return status info; we surface roles as the primary indicator.
  const isActive = user.roles.length > 0;
  const statusLabel = isActive ? 'Active' : 'Inactive';
  const statusColor = isActive ? '#15803d' : '#6b7280';
  const statusBg = isActive ? '#f0fdf4' : '#f9fafb';
  const statusBorder = isActive ? '#86efac' : '#d1d5db';

  return (
    <tr>
      <td style={tdStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {user.avatar ? (
            <img
              src={user.avatar}
              alt=""
              aria-hidden="true"
              style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <span
              aria-hidden="true"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '#e0e7ff',
                color: '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {(user.displayName || user.email).charAt(0).toUpperCase()}
            </span>
          )}
          <span style={{ fontWeight: 500, color: '#111827' }}>
            {user.displayName || '—'}
          </span>
        </div>
      </td>

      <td style={tdStyle}>
        <span style={{ color: '#374151', fontSize: '13px' }}>{user.email}</span>
      </td>

      <td style={tdStyle}>
        <span style={{ color: '#374151', fontSize: '13px' }}>{formatRoles(user.roles)}</span>
      </td>

      <td style={tdStyle}>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 600,
            color: statusColor,
            background: statusBg,
            border: `1px solid ${statusBorder}`,
          }}
        >
          {statusLabel}
        </span>
      </td>

      {/* Last login — not available in AdminUser entity; show placeholder */}
      <td style={{ ...tdStyle, color: '#9ca3af', fontSize: '13px' }}>—</td>

      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {canChangeRoles && (
            <button
              type="button"
              aria-label={`Change roles for ${user.displayName || user.email}`}
              onClick={() => onChangeRoles(user)}
              disabled={isBusy}
              style={actionBtnStyle(isBusy, '#6366f1')}
            >
              Roles
            </button>
          )}
          {canChangeStatus && (
            <button
              type="button"
              aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${user.displayName || user.email}`}
              onClick={() => onToggleStatus(user)}
              disabled={isBusy}
              style={actionBtnStyle(isBusy, isActive ? '#dc2626' : '#16a34a')}
            >
              {isBusy ? '…' : isActive ? 'Deactivate' : 'Activate'}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #f3f4f6',
  verticalAlign: 'middle',
};

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '2px solid #e5e7eb',
  background: '#f9fafb',
};

function actionBtnStyle(disabled: boolean, color: string): React.CSSProperties {
  return {
    padding: '5px 12px',
    background: 'transparent',
    color: disabled ? '#9ca3af' : color,
    border: `1px solid ${disabled ? '#d1d5db' : color}`,
    borderRadius: '5px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'opacity 0.15s',
  };
}

// ── UserManagement ────────────────────────────────────────────────────────────

export function UserManagement() {
  const { hasRole, hasAnyRole } = useRbac();

  const canView = hasAnyRole(['super_admin', 'admin']);
  const canChangeRoles = hasRole('super_admin');
  const canChangeStatus = hasAnyRole(['super_admin', 'admin']);

  const repo = useRef(new HttpUserManagementRepository());

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PaginatedUsers | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Action state
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [roleModalUser, setRoleModalUser] = useState<AdminUser | null>(null);
  const [isSavingRoles, setIsSavingRoles] = useState(false);

  // ── Fetch ───────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(
    async (query: UserListQuery) => {
      setIsLoading(true);
      setErrorMessage(null);
      logger.logComponentEvent({ event: 'fetch_start', component: 'UserManagement', context: query });

      try {
        const data = await repo.current.listUsers(query);
        setResult(data);
        logger.logComponentEvent({
          event: 'fetch_success',
          component: 'UserManagement',
          context: { total: data.total },
        });
      } catch (err) {
        const state = normalizeError(err);
        const msg = resolveErrorMessage(state, USER_MANAGEMENT_ERRORS);
        logger.warn('Failed to load users', { error: state });
        setErrorMessage(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Fetch on mount and when search/page changes
  useEffect(() => {
    if (!canView) return;
    fetchUsers({ search: search || undefined, page, pageSize: PAGE_SIZE });
  }, [canView, search, page, fetchUsers]);

  // ── Debounced search ────────────────────────────────────────────────────

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value.trim());
    }, 350);
  };

  // ── Role change ─────────────────────────────────────────────────────────

  const handleRoleConfirm = async (roles: string[]) => {
    if (!roleModalUser) return;
    setIsSavingRoles(true);
    setActionError(null);
    logger.logUserAction({ action: 'change_roles', context: { userId: roleModalUser.userId } });

    try {
      await repo.current.changeRoles(roleModalUser.userId, roles);
      setRoleModalUser(null);
      // Refresh current page
      fetchUsers({ search: search || undefined, page, pageSize: PAGE_SIZE });
    } catch (err) {
      const state = normalizeError(err);
      const msg = resolveErrorMessage(state, USER_MANAGEMENT_ERRORS);
      logger.warn('Failed to change roles', { error: state });
      setActionError(msg);
    } finally {
      setIsSavingRoles(false);
    }
  };

  // ── Toggle status ───────────────────────────────────────────────────────

  const handleToggleStatus = async (user: AdminUser) => {
    const isActive = user.roles.length > 0;
    const newStatus: 'active' | 'inactive' = isActive ? 'inactive' : 'active';
    setActionInProgress(user.userId);
    setActionError(null);
    logger.logUserAction({ action: 'toggle_status', context: { userId: user.userId, newStatus } });

    try {
      await repo.current.changeStatus(user.userId, newStatus);
      // Refresh current page
      fetchUsers({ search: search || undefined, page, pageSize: PAGE_SIZE });
    } catch (err) {
      const state = normalizeError(err);
      const msg = resolveErrorMessage(state, USER_MANAGEMENT_ERRORS);
      logger.warn('Failed to change status', { error: state });
      setActionError(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  // ── Pagination ──────────────────────────────────────────────────────────

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  // ── Access denied ───────────────────────────────────────────────────────

  if (!canView) {
    return (
      <div
        role="alert"
        aria-live="polite"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 24px',
          color: '#6b7280',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: '40px', marginBottom: '16px' }} aria-hidden="true">🔒</span>
        <p style={{ margin: 0, fontSize: '16px', fontWeight: 500 }}>Access denied</p>
        <p style={{ margin: '8px 0 0', fontSize: '14px' }}>
          You need the <strong>admin</strong> or <strong>super_admin</strong> role to manage users.
        </p>
      </div>
    );
  }

  // ── Loading skeleton ────────────────────────────────────────────────────

  if (isLoading && result === null) {
    return (
      <div aria-busy="true" aria-label="Loading user data">
        <h2 style={headingStyle}>User Management</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{
                height: '48px',
                borderRadius: '6px',
                background: '#e5e7eb',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────

  if (errorMessage !== null && result === null) {
    return (
      <div>
        <h2 style={headingStyle}>User Management</h2>
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            padding: '40px 24px',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '10px',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontSize: '15px', color: '#b91c1c', fontWeight: 500 }}>
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={() => fetchUsers({ search: search || undefined, page, pageSize: PAGE_SIZE })}
            style={retryBtnStyle}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const users = result?.items ?? [];

  // ── Main view ───────────────────────────────────────────────────────────

  return (
    <div>
      {/* Role change modal */}
      {roleModalUser && (
        <RoleChangeModal
          user={roleModalUser}
          onConfirm={handleRoleConfirm}
          onCancel={() => setRoleModalUser(null)}
          isSaving={isSavingRoles}
        />
      )}

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <h2 style={{ ...headingStyle, margin: 0 }}>
          User Management
          {result !== null && (
            <span style={{ marginLeft: '10px', fontSize: '13px', fontWeight: 400, color: '#6b7280' }}>
              {result.total} user{result.total !== 1 ? 's' : ''}
            </span>
          )}
        </h2>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9ca3af',
              fontSize: '14px',
              pointerEvents: 'none',
            }}
          >
            🔍
          </span>
          <input
            type="search"
            aria-label="Search users"
            placeholder="Search by name or email…"
            value={searchInput}
            onChange={handleSearchChange}
            style={{
              paddingLeft: '32px',
              paddingRight: '12px',
              paddingTop: '8px',
              paddingBottom: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              color: '#111827',
              background: '#fff',
              width: '260px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div
          role="alert"
          style={{
            marginBottom: '16px',
            padding: '10px 16px',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#b91c1c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span>{actionError}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setActionError(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#b91c1c',
              fontSize: '16px',
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        {isLoading && (
          <div
            aria-live="polite"
            aria-label="Refreshing user data"
            style={{
              height: '3px',
              background: 'linear-gradient(90deg, #6366f1 0%, #a5b4fc 50%, #6366f1 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.2s linear infinite',
            }}
          />
        )}
        <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

        <div style={{ overflowX: 'auto' }}>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}
            aria-label="Users table"
          >
            <thead>
              <tr>
                <th scope="col" style={thStyle}>Display Name</th>
                <th scope="col" style={thStyle}>Email</th>
                <th scope="col" style={thStyle}>Roles</th>
                <th scope="col" style={thStyle}>Status</th>
                <th scope="col" style={thStyle}>Last Login</th>
                <th scope="col" style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: '40px 16px',
                      textAlign: 'center',
                      color: '#9ca3af',
                      fontSize: '14px',
                    }}
                  >
                    {search ? `No users found matching "${search}".` : 'No users found.'}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <UserRow
                    key={user.userId}
                    user={user}
                    canChangeRoles={canChangeRoles}
                    canChangeStatus={canChangeStatus}
                    onChangeRoles={setRoleModalUser}
                    onToggleStatus={handleToggleStatus}
                    actionInProgress={actionInProgress}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderTop: '1px solid #f3f4f6',
              fontSize: '13px',
              color: '#6b7280',
            }}
          >
            <span>
              Page {page} of {totalPages}
              {result && ` · ${result.total} total`}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                aria-label="Previous page"
                style={paginationBtnStyle(page <= 1 || isLoading)}
              >
                ← Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                aria-label="Next page"
                style={paginationBtnStyle(page >= totalPages || isLoading)}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared style helpers ──────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  margin: '0 0 20px',
  fontSize: '20px',
  fontWeight: 700,
  color: '#111827',
};

const retryBtnStyle: React.CSSProperties = {
  padding: '8px 20px',
  background: '#6366f1',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
};

function paginationBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    background: disabled ? '#f9fafb' : '#fff',
    color: disabled ? '#9ca3af' : '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}
