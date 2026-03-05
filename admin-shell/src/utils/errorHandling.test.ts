/**
 * Tests for error handling utilities.
 * Validates normalizeError and resolveErrorMessage (Req 1.6, 6.4).
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeError,
  resolveErrorMessage,
  isApiError,
  HEALTH_DASHBOARD_ERRORS,
  USER_MANAGEMENT_ERRORS,
  AUDIT_LOG_ERRORS,
  type ApiError,
  type ErrorState,
} from './errorHandling';

describe('isApiError', () => {
  it('returns true for valid ApiError shape', () => {
    const err: ApiError = { status: 403, error: 'FORBIDDEN', message: 'Access denied' };
    expect(isApiError(err)).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isApiError(new Error('oops'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isApiError(null)).toBe(false);
  });

  it('returns false for missing fields', () => {
    expect(isApiError({ status: 403 })).toBe(false);
    expect(isApiError({ error: 'FORBIDDEN' })).toBe(false);
  });
});

describe('normalizeError', () => {
  it('normalizes ApiError to type "api"', () => {
    const err: ApiError = { status: 404, error: 'SERVICE_NOT_FOUND', message: 'Not found' };
    const result = normalizeError(err);
    expect(result).toEqual({ message: 'Not found', type: 'api', code: 'SERVICE_NOT_FOUND' });
  });

  it('normalizes TypeError to type "network"', () => {
    const err = new TypeError('Failed to fetch');
    const result = normalizeError(err);
    expect(result.type).toBe('network');
    expect(result.message).toContain('network error');
  });

  it('normalizes Error with name "NetworkError" to type "network"', () => {
    const err = new Error('Network failure');
    err.name = 'NetworkError';
    const result = normalizeError(err);
    expect(result.type).toBe('network');
  });

  it('normalizes Error with name "ValidationError" to type "validation"', () => {
    const err = new Error('Invalid input');
    err.name = 'ValidationError';
    const result = normalizeError(err);
    expect(result.type).toBe('validation');
    expect(result.message).toBe('Invalid input');
  });

  it('normalizes generic Error to type "unknown"', () => {
    const err = new Error('Something went wrong');
    const result = normalizeError(err);
    expect(result.type).toBe('unknown');
    expect(result.message).toBe('Something went wrong');
  });

  it('normalizes non-Error values to type "unknown"', () => {
    const result = normalizeError('some string error');
    expect(result.type).toBe('unknown');
    expect(result.message).toBe('An unexpected error occurred.');
  });

  it('normalizes null to type "unknown"', () => {
    const result = normalizeError(null);
    expect(result.type).toBe('unknown');
  });
});

describe('resolveErrorMessage', () => {
  const map = {
    default: 'Default error message',
    FORBIDDEN: 'You are not allowed',
    network: 'Network problem',
  };

  it('resolves by error code first', () => {
    const state: ErrorState = { message: 'x', type: 'api', code: 'FORBIDDEN' };
    expect(resolveErrorMessage(state, map)).toBe('You are not allowed');
  });

  it('resolves by error type when no code match', () => {
    const state: ErrorState = { message: 'x', type: 'network' };
    expect(resolveErrorMessage(state, map)).toBe('Network problem');
  });

  it('falls back to default when no code or type match', () => {
    const state: ErrorState = { message: 'x', type: 'unknown' };
    expect(resolveErrorMessage(state, map)).toBe('Default error message');
  });

  it('uses HEALTH_DASHBOARD_ERRORS map correctly', () => {
    const state: ErrorState = { message: 'x', type: 'api', code: 'FORBIDDEN' };
    expect(resolveErrorMessage(state, HEALTH_DASHBOARD_ERRORS)).toBe(
      'You do not have permission to view the health dashboard.',
    );
  });

  it('uses USER_MANAGEMENT_ERRORS map correctly', () => {
    const state: ErrorState = { message: 'x', type: 'api', code: 'EXTERNAL_SERVICE_ERROR' };
    expect(resolveErrorMessage(state, USER_MANAGEMENT_ERRORS)).toContain('identity or profile service');
  });

  it('uses AUDIT_LOG_ERRORS map correctly', () => {
    const state: ErrorState = { message: 'x', type: 'api', code: 'GATEWAY_TIMEOUT' };
    expect(resolveErrorMessage(state, AUDIT_LOG_ERRORS)).toContain('timed out');
  });
});
