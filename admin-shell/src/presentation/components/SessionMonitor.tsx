/**
 * SessionMonitor — polls token expiry and warns the user before auto-logout.
 *
 * Requirements:
 *   1.7 — IF the JWT expires during an active session, THEN the Admin_Shell
 *         SHALL attempt a silent token refresh and, if refresh fails, redirect
 *         the Admin_User to the login screen.
 *   2.4 — WHEN the access token is within 60 seconds of expiration and a valid
 *         refresh token exists, the BFF_Proxy SHALL transparently refresh the
 *         token pair (handled server-side; this component handles the UI side).
 *
 * Behaviour:
 *   - Polls token expiry every 30 seconds.
 *   - Shows a fixed-position warning toast when the token is within
 *     `warningThreshold` seconds of expiry (default: 300 = 5 minutes).
 *   - Displays a live countdown timer inside the warning.
 *   - "Continue Session" button triggers a silent token refresh via `onRefresh`.
 *   - Auto-logout (calls `onSessionExpired`) when the token expires.
 *   - Cleans up all timers on unmount.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getComponentLogger } from '../../utils/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionMonitorProps {
  /**
   * Returns the token expiry as a Unix timestamp (seconds), or null if there
   * is no active token.
   */
  getTokenExpiry: () => number | null;

  /** Triggers a silent token refresh. */
  onRefresh: () => Promise<void>;

  /** Called when the token has expired and the session must end. */
  onSessionExpired: () => void;

  /**
   * Seconds before expiry at which the warning toast is shown.
   * Defaults to 300 (5 minutes).
   */
  warningThreshold?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const COUNTDOWN_INTERVAL_MS = 1_000; // 1 second
const DEFAULT_WARNING_THRESHOLD_S = 300; // 5 minutes

// ── Logger ────────────────────────────────────────────────────────────────────

const logger = getComponentLogger('SessionMonitor');

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionMonitor({
  getTokenExpiry,
  onRefresh,
  onSessionExpired,
  warningThreshold = DEFAULT_WARNING_THRESHOLD_S,
}: SessionMonitorProps): React.ReactElement | null {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Stable refs so interval callbacks always see the latest props/state.
  const onRefreshRef = useRef(onRefresh);
  const onSessionExpiredRef = useRef(onSessionExpired);
  const getTokenExpiryRef = useRef(getTokenExpiry);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  useEffect(() => {
    getTokenExpiryRef.current = getTokenExpiry;
  }, [getTokenExpiry]);

  // ── Expiry check (runs every 30 s) ─────────────────────────────────────────

  const checkExpiry = useCallback(() => {
    const expiry = getTokenExpiryRef.current();

    if (expiry === null) {
      // No active token — nothing to monitor.
      setSecondsRemaining(null);
      return;
    }

    const nowS = Math.floor(Date.now() / 1000);
    const remaining = expiry - nowS;

    if (remaining <= 0) {
      logger.warn('Session token has expired — triggering logout');
      setSecondsRemaining(null);
      onSessionExpiredRef.current();
      return;
    }

    if (remaining <= warningThreshold) {
      logger.info('Session token nearing expiry — showing warning', {
        secondsRemaining: remaining,
        warningThreshold,
      });
      setSecondsRemaining(remaining);
    } else {
      // Token is healthy — hide any existing warning.
      setSecondsRemaining(null);
    }
  }, [warningThreshold]);

  // Run the expiry check on mount and then every 30 seconds.
  useEffect(() => {
    checkExpiry();
    const pollId = setInterval(checkExpiry, POLL_INTERVAL_MS);
    return () => clearInterval(pollId);
  }, [checkExpiry]);

  // ── Countdown timer (runs every 1 s while warning is visible) ──────────────

  useEffect(() => {
    if (secondsRemaining === null) return;

    const countdownId = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev === null) return null;

        const next = prev - 1;

        if (next <= 0) {
          logger.warn('Countdown reached zero — triggering logout');
          onSessionExpiredRef.current();
          return null;
        }

        return next;
      });
    }, COUNTDOWN_INTERVAL_MS);

    return () => clearInterval(countdownId);
  }, [secondsRemaining]);

  // ── "Continue Session" handler ─────────────────────────────────────────────

  const handleContinue = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    logger.logUserAction({ action: 'continue_session', target: 'SessionMonitor' });

    try {
      await onRefreshRef.current();
      // Refresh succeeded — hide the warning.
      setSecondsRemaining(null);
      logger.info('Silent token refresh succeeded — warning dismissed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token refresh failed';
      logger.warn('Silent token refresh failed — session will expire', { error: message });
      // Let the countdown continue; the next poll or countdown tick will
      // call onSessionExpired when the token actually expires.
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (secondsRemaining === null) {
    return null;
  }

  return <WarningToast secondsRemaining={secondsRemaining} isRefreshing={isRefreshing} onContinue={handleContinue} />;
}

// ── Warning Toast ─────────────────────────────────────────────────────────────

interface WarningToastProps {
  secondsRemaining: number;
  isRefreshing: boolean;
  onContinue: () => void;
}

function WarningToast({ secondsRemaining, isRefreshing, onContinue }: WarningToastProps): React.ReactElement {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const countdownLabel =
    minutes > 0
      ? `${minutes}m ${String(seconds).padStart(2, '0')}s`
      : `${seconds}s`;

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 9999,
        width: '22rem',
        padding: '1rem 1.25rem',
        backgroundColor: '#fffbeb',
        border: '1px solid #f59e0b',
        borderRadius: '0.5rem',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontFamily: 'sans-serif',
        animation: 'sessionMonitorSlideIn 0.25s ease-out',
      }}
    >
      {/* Inject keyframe once via a <style> tag */}
      <style>{`
        @keyframes sessionMonitorSlideIn {
          from { opacity: 0; transform: translateY(1rem); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <p
        style={{
          margin: '0 0 0.25rem',
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: '#92400e',
        }}
      >
        Your session is about to expire
      </p>

      <p
        style={{
          margin: '0 0 0.875rem',
          fontSize: '0.875rem',
          color: '#78350f',
        }}
      >
        Session expires in{' '}
        <strong
          aria-label={`${secondsRemaining} seconds remaining`}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {countdownLabel}
        </strong>
        . Continue to stay logged in.
      </p>

      <button
        type="button"
        onClick={onContinue}
        disabled={isRefreshing}
        aria-busy={isRefreshing}
        style={{
          padding: '0.4375rem 1rem',
          backgroundColor: isRefreshing ? '#d97706' : '#f59e0b',
          color: '#fff',
          border: 'none',
          borderRadius: '0.375rem',
          cursor: isRefreshing ? 'not-allowed' : 'pointer',
          fontSize: '0.875rem',
          fontWeight: 500,
          opacity: isRefreshing ? 0.75 : 1,
          transition: 'opacity 0.15s, background-color 0.15s',
        }}
      >
        {isRefreshing ? 'Refreshing…' : 'Continue Session'}
      </button>
    </div>
  );
}

export default SessionMonitor;
