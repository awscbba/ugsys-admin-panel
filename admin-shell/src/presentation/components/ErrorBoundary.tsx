/**
 * ErrorBoundary — React class component for catching rendering failures.
 *
 * Requirements:
 *   1.6 — Global error boundary catches rendering failures in any Micro_Frontend
 *         and displays a fallback UI without crashing the entire application.
 *   6.4 — If a Micro_Frontend bundle fails to load, display an error message
 *         identifying the failed service and provide a retry button.
 *
 * Usage:
 *   // Global boundary (wraps entire app)
 *   <ErrorBoundary name="AppRoot">
 *     <App />
 *   </ErrorBoundary>
 *
 *   // Per-micro-frontend boundary
 *   <ErrorBoundary name={serviceName} fallback={<ServiceFallback />}>
 *     <MicroFrontend entryPoint={url} />
 *   </ErrorBoundary>
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { getComponentLogger } from '../../utils/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  /** Identifies which boundary caught the error (used in logs and fallback UI). */
  name?: string;
  /** Custom fallback UI. When provided, replaces the default fallback. */
  fallback?: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private readonly logger = getComponentLogger('ErrorBoundary');

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { name = 'unknown' } = this.props;

    this.setState({ errorInfo });

    this.logger.error('Rendering failure caught by ErrorBoundary', {
      boundaryName: name,
      errorMessage: error.message,
      errorName: error.name,
      componentStack: errorInfo.componentStack ?? undefined,
    });
  }

  handleRetry(): void {
    const { name = 'unknown' } = this.props;

    this.logger.info('User triggered ErrorBoundary retry', { boundaryName: name });

    this.setState({ hasError: false, error: null, errorInfo: null });
  }

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { name, fallback, children } = this.props;

    if (!hasError) {
      return children;
    }

    // Custom fallback provided by the caller
    if (fallback !== undefined) {
      return fallback;
    }

    // Default fallback UI
    return (
      <DefaultFallback
        name={name}
        error={error}
        errorInfo={errorInfo}
        onRetry={this.handleRetry}
      />
    );
  }
}

// ── Default Fallback UI ───────────────────────────────────────────────────────

interface DefaultFallbackProps {
  name?: string;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  onRetry: () => void;
}

function DefaultFallback({ name, error, errorInfo, onRetry }: DefaultFallbackProps): ReactNode {
  const isDev = import.meta.env.DEV;
  const label = name ? `"${name}"` : 'this section';

  return (
    <div
      role="alert"
      style={{
        padding: '1.5rem',
        border: '1px solid #f87171',
        borderRadius: '0.5rem',
        backgroundColor: '#fef2f2',
        color: '#991b1b',
        fontFamily: 'sans-serif',
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.125rem', fontWeight: 600 }}>
        Something went wrong in {label}
      </h2>

      <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#7f1d1d' }}>
        An unexpected error occurred while rendering this component. You can try again or reload
        the page.
      </p>

      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#dc2626',
          color: '#fff',
          border: 'none',
          borderRadius: '0.375rem',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        Try again
      </button>

      {/* Dev-only error details — hidden in production */}
      {isDev && error !== null && (
        <details
          style={{
            marginTop: '1rem',
            fontSize: '0.75rem',
            color: '#374151',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '0.25rem',
            padding: '0.75rem',
          }}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '0.5rem' }}>
            Error details (dev only)
          </summary>

          <p style={{ margin: '0 0 0.25rem' }}>
            <strong>{error.name}:</strong> {error.message}
          </p>

          {error.stack !== undefined && (
            <pre
              style={{
                margin: '0.5rem 0 0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '0.7rem',
                color: '#6b7280',
              }}
            >
              {error.stack}
            </pre>
          )}

          {errorInfo?.componentStack !== undefined && (
            <>
              <p style={{ margin: '0.75rem 0 0.25rem', fontWeight: 600 }}>Component stack:</p>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '0.7rem',
                  color: '#6b7280',
                }}
              >
                {errorInfo.componentStack}
              </pre>
            </>
          )}
        </details>
      )}
    </div>
  );
}

export default ErrorBoundary;
