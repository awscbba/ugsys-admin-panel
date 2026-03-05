/**
 * Tests for secureLogging utilities.
 * Validates sensitive field redaction (Req 13.7).
 */

import { describe, it, expect } from 'vitest';
import { sanitizeObject } from './secureLogging';

describe('sanitizeObject', () => {
  it('redacts password fields', () => {
    const result = sanitizeObject({ password: 'secret123', username: 'alice' });
    expect(result).toEqual({ password: '[REDACTED]', username: 'alice' });
  });

  it('redacts token fields', () => {
    const result = sanitizeObject({ token: 'abc.def.ghi', userId: '123' });
    expect(result).toEqual({ token: '[REDACTED]', userId: '123' });
  });

  it('redacts accessToken fields', () => {
    const result = sanitizeObject({ accessToken: 'abc', refreshToken: 'xyz' });
    expect(result).toEqual({ accessToken: '[REDACTED]', refreshToken: '[REDACTED]' });
  });

  it('redacts secret fields', () => {
    const result = sanitizeObject({ clientSecret: 'my-secret', name: 'app' });
    expect(result).toEqual({ clientSecret: '[REDACTED]', name: 'app' });
  });

  it('redacts auth fields', () => {
    const result = sanitizeObject({ authorization: 'Bearer xyz', path: '/api' });
    expect(result).toEqual({ authorization: '[REDACTED]', path: '/api' });
  });

  it('redacts jwt fields', () => {
    const result = sanitizeObject({ jwt: 'header.payload.sig' });
    expect(result).toEqual({ jwt: '[REDACTED]' });
  });

  it('redacts bearer fields', () => {
    const result = sanitizeObject({ bearerToken: 'xyz' });
    expect(result).toEqual({ bearerToken: '[REDACTED]' });
  });

  it('redacts cookie fields', () => {
    const result = sanitizeObject({ cookie: 'session=abc' });
    expect(result).toEqual({ cookie: '[REDACTED]' });
  });

  it('redacts credential fields', () => {
    const result = sanitizeObject({ credentials: { user: 'a', pass: 'b' } });
    expect(result).toEqual({ credentials: '[REDACTED]' });
  });

  it('redacts session fields', () => {
    const result = sanitizeObject({ sessionId: 'sess-123', page: 1 });
    expect(result).toEqual({ sessionId: '[REDACTED]', page: 1 });
  });

  it('leaves non-sensitive fields untouched', () => {
    const result = sanitizeObject({ userId: '123', email: 'a@b.com', roles: ['admin'] });
    expect(result).toEqual({ userId: '123', email: 'a@b.com', roles: ['admin'] });
  });

  it('handles nested objects recursively', () => {
    const result = sanitizeObject({
      user: { id: '1', password: 'secret', profile: { name: 'Alice' } },
    });
    expect(result).toEqual({
      user: { id: '1', password: '[REDACTED]', profile: { name: 'Alice' } },
    });
  });

  it('handles arrays of objects', () => {
    const result = sanitizeObject([
      { token: 'abc', id: '1' },
      { token: 'def', id: '2' },
    ]);
    expect(result).toEqual([
      { token: '[REDACTED]', id: '1' },
      { token: '[REDACTED]', id: '2' },
    ]);
  });

  it('returns primitives unchanged', () => {
    expect(sanitizeObject('hello')).toBe('hello');
    expect(sanitizeObject(42)).toBe(42);
    expect(sanitizeObject(true)).toBe(true);
    expect(sanitizeObject(null)).toBe(null);
  });

  it('handles empty objects', () => {
    expect(sanitizeObject({})).toEqual({});
  });

  it('handles empty arrays', () => {
    expect(sanitizeObject([])).toEqual([]);
  });

  it('is case-insensitive for sensitive key matching', () => {
    const result = sanitizeObject({ PASSWORD: 'abc', Token: 'xyz', SECRET: 'shh' });
    expect(result).toEqual({ PASSWORD: '[REDACTED]', Token: '[REDACTED]', SECRET: '[REDACTED]' });
  });
});
