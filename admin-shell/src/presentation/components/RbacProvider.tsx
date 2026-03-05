/**
 * RbacProvider — shared RBAC context for micro-frontends and built-in views.
 *
 * Requirements: 3.4, 3.5
 *
 * Provides:
 *   RbacContext  — { userRoles, hasRole, hasAnyRole, isAdmin }
 *   RbacProvider — reads from authStore.$user, supplies context to children
 *   useRbac()    — hook for consuming the context
 *
 * ADMIN_ROLES mirrors the backend domain value object:
 *   super_admin | admin | moderator | auditor
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { $user } from '../../stores/authStore';

// ── Constants ─────────────────────────────────────────────────────────────

export const ADMIN_ROLES = new Set([
  'super_admin',
  'admin',
  'moderator',
  'auditor',
]);

// ── Context shape ─────────────────────────────────────────────────────────

export interface RbacContextValue {
  /** Roles held by the currently authenticated user. Empty array when unauthenticated. */
  userRoles: string[];
  /** Returns true when the user holds the given role. */
  hasRole: (role: string) => boolean;
  /** Returns true when the user holds at least one of the given roles. */
  hasAnyRole: (roles: string[]) => boolean;
  /** Returns true when the user holds at least one admin role. */
  isAdmin: () => boolean;
}

// ── Context ───────────────────────────────────────────────────────────────

const RbacContext = createContext<RbacContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────

interface RbacProviderProps {
  children: React.ReactNode;
}

export function RbacProvider({ children }: RbacProviderProps): React.JSX.Element {
  const user = useStore($user);

  const value = useMemo<RbacContextValue>(() => {
    const userRoles: string[] = user?.roles ?? [];

    return {
      userRoles,
      hasRole: (role: string) => userRoles.includes(role),
      hasAnyRole: (roles: string[]) => roles.some((r) => userRoles.includes(r)),
      isAdmin: () => userRoles.some((r) => ADMIN_ROLES.has(r)),
    };
  }, [user]);

  return <RbacContext.Provider value={value}>{children}</RbacContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * Consume the RBAC context.
 * Must be used inside a <RbacProvider>.
 */
export function useRbac(): RbacContextValue {
  const ctx = useContext(RbacContext);
  if (ctx === null) {
    throw new Error('useRbac must be used within a RbacProvider');
  }
  return ctx;
}
