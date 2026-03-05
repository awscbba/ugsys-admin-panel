/**
 * Error handling utilities for the Admin Shell.
 *
 * Requirements:
 *   1.6 — Global error boundary catches rendering failures in any Micro_Frontend
 *         and displays a fallback UI without crashing the entire application.
 *   6.4 — If a Micro_Frontend bundle fails to load, display an error message
 *         identifying the failed service and provide a retry button.
 */

import { getServiceLogger } from "./logger";

const logger = getServiceLogger("errorHandling");

// ── ErrorState ────────────────────────────────────────────────────────────────

export type ErrorType = "api" | "network" | "validation" | "unknown";

export interface ErrorState {
  message: string;
  type: ErrorType;
  /** Machine-readable error code from the BFF (e.g. "SERVICE_NOT_FOUND"). */
  code?: string;
}

// ── ApiError ──────────────────────────────────────────────────────────────────

/**
 * Structured error returned by the BFF Proxy.
 * Matches the platform-standard error response shape:
 *   { error: string, message: string, data?: unknown }
 */
export interface ApiError {
  /** HTTP status code */
  status: number;
  /** Machine-readable error code from the BFF (e.g. "FORBIDDEN") */
  error: string;
  /** Safe user-facing message from the BFF */
  message: string;
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["status"] === "number" &&
    typeof (value as Record<string, unknown>)["error"] === "string" &&
    typeof (value as Record<string, unknown>)["message"] === "string"
  );
}

// ── normalizeError ────────────────────────────────────────────────────────────

/**
 * Converts any thrown value into a normalized `ErrorState`.
 *
 * Conversion rules:
 *   - `ApiError`          → type "api",        code = ApiError.error
 *   - `TypeError` (fetch) → type "network"
 *   - `Error` with name "NetworkError" → type "network"
 *   - `Error` with name "ValidationError" → type "validation"
 *   - Everything else     → type "unknown"
 */
export function normalizeError(err: unknown): ErrorState {
  if (isApiError(err)) {
    logger.warn("API error", { status: err.status, code: err.error });
    return {
      message: err.message,
      type: "api",
      code: err.error,
    };
  }

  if (err instanceof TypeError) {
    // fetch() throws TypeError on network failures (e.g. DNS, CORS, offline)
    logger.warn("Network error (TypeError)", { message: err.message });
    return {
      message:
        "A network error occurred. Please check your connection and try again.",
      type: "network",
    };
  }

  if (err instanceof Error) {
    if (err.name === "NetworkError") {
      logger.warn("Network error", { message: err.message });
      return {
        message:
          "A network error occurred. Please check your connection and try again.",
        type: "network",
      };
    }

    if (err.name === "ValidationError") {
      logger.warn("Validation error", { message: err.message });
      return {
        message: err.message,
        type: "validation",
      };
    }

    logger.error("Unknown error (Error instance)", {
      name: err.name,
      message: err.message,
    });
    return {
      message: err.message || "An unexpected error occurred.",
      type: "unknown",
    };
  }

  logger.error("Unknown error (non-Error value)", { value: String(err) });
  return {
    message: "An unexpected error occurred.",
    type: "unknown",
  };
}

// ── Context-specific error message maps ───────────────────────────────────────

/**
 * A context-specific error message map resolves a BFF error code (or error
 * type) to a human-friendly string for a particular view.  Falls back to the
 * `default` key when no specific mapping exists.
 */
export type ErrorMessageMap = Record<string, string> & { default: string };

// Health Dashboard ─────────────────────────────────────────────────────────────

export const HEALTH_DASHBOARD_ERRORS: ErrorMessageMap = {
  default: "Unable to load service health data. Please try again.",
  FORBIDDEN: "You do not have permission to view the health dashboard.",
  SERVICE_NOT_FOUND: "The requested service could not be found.",
  GATEWAY_TIMEOUT:
    "Health data request timed out. The service may be unavailable.",
  EXTERNAL_SERVICE_ERROR:
    "Could not reach the health aggregator. Please try again later.",
  network:
    "Network error while loading health data. Please check your connection.",
  unknown: "An unexpected error occurred while loading health data.",
};

// User Management ──────────────────────────────────────────────────────────────

export const USER_MANAGEMENT_ERRORS: ErrorMessageMap = {
  default: "Unable to load user data. Please try again.",
  FORBIDDEN: "You do not have permission to manage users.",
  SERVICE_NOT_FOUND: "The user management service could not be found.",
  GATEWAY_TIMEOUT: "User data request timed out. Please try again.",
  EXTERNAL_SERVICE_ERROR:
    "The identity or profile service is currently unavailable. Please try again later.",
  network:
    "Network error while loading user data. Please check your connection.",
  unknown: "An unexpected error occurred while loading user data.",
};

// Audit Log ────────────────────────────────────────────────────────────────────

export const AUDIT_LOG_ERRORS: ErrorMessageMap = {
  default: "Unable to load audit log entries. Please try again.",
  FORBIDDEN: "You do not have permission to view the audit log.",
  SERVICE_NOT_FOUND: "The audit log service could not be found.",
  GATEWAY_TIMEOUT: "Audit log request timed out. Please try again.",
  EXTERNAL_SERVICE_ERROR:
    "The audit service is currently unavailable. Please try again later.",
  network:
    "Network error while loading audit log. Please check your connection.",
  unknown: "An unexpected error occurred while loading the audit log.",
};

// ── resolveErrorMessage ───────────────────────────────────────────────────────

/**
 * Resolves a human-friendly message for an `ErrorState` using the provided
 * context-specific message map.
 *
 * Resolution order:
 *   1. `state.code`  (BFF error code, e.g. "FORBIDDEN")
 *   2. `state.type`  (error category, e.g. "network")
 *   3. `map.default` (catch-all)
 */
export function resolveErrorMessage(
  state: ErrorState,
  map: ErrorMessageMap,
): string {
  if (state.code !== undefined && state.code in map) {
    return map[state.code];
  }
  if (state.type in map) {
    return map[state.type];
  }
  return map.default;
}
