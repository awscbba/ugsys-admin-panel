/**
 * Secure logging utilities with sensitive field redaction.
 * Requirement: 13.7 — log auth failures without credentials/tokens.
 */

const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /\bkey\b/i,
  /auth/i,
  /credential/i,
  /session/i,
  /cookie/i,
  /jwt/i,
  /bearer/i,
];

const REDACTED = "[REDACTED]";

/**
 * Checks whether a field name matches any sensitive pattern.
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Recursively redacts fields whose names match sensitive patterns.
 * Handles plain objects and arrays; leaves primitives untouched.
 */
export function sanitizeObject<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item)) as unknown as T;
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = isSensitiveKey(k) ? REDACTED : sanitizeObject(v);
    }
    return result as T;
  }

  return value;
}

/**
 * Wraps a console method so every argument is sanitized before output.
 */
function wrapConsoleMethod(
  method: (...args: unknown[]) => void,
): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    const sanitized = args.map((arg) =>
      arg !== null && typeof arg === "object" ? sanitizeObject(arg) : arg,
    );
    method(...sanitized);
  };
}

/**
 * Overrides console.log, console.error, and console.warn in development mode
 * so that all object arguments are automatically sanitized before output.
 *
 * Call once at application startup (e.g. in main.tsx).
 */
export function enableSecureLogging(): void {
  if (import.meta.env.DEV) {
    console.log = wrapConsoleMethod(console.log.bind(console));
    console.error = wrapConsoleMethod(console.error.bind(console));
    console.warn = wrapConsoleMethod(console.warn.bind(console));
  }
}
