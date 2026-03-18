/**
 * HttpClient — Singleton HTTP client for the Admin Shell.
 *
 * Responsibilities:
 * - Injects `Authorization: Bearer` header on every request
 * - Reads CSRF token from the `csrf_token` cookie and injects
 *   `X-CSRF-Token` header on state-changing operations (POST, PUT, PATCH, DELETE)
 * - On 401: attempts a silent token refresh via POST /api/v1/auth/refresh,
 *   then retries the original request once with the new token
 * - On refresh failure: triggers force logout (no redirect — the component
 *   that receives the rejection handles navigation)
 *
 * Requirements: 2.4, 2.5, 2.8
 */

type ForceLogoutCallback = () => void;

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getCsrfTokenFromCookie(): string | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrf_token="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

export class HttpClient {
  private static instance: HttpClient | null = null;

  /** Bearer token kept in memory — never persisted to localStorage/sessionStorage */
  private accessToken: string | null = null;

  /** Prevents concurrent refresh races */
  private refreshPromise: Promise<string | null> | null = null;

  private forceLogoutCallback: ForceLogoutCallback | null = null;

  private constructor() {}

  static getInstance(): HttpClient {
    if (!HttpClient.instance) {
      HttpClient.instance = new HttpClient();
    }
    return HttpClient.instance;
  }

  /** Register a callback that is invoked when a token refresh fails. */
  setForceLogoutCallback(callback: ForceLogoutCallback): void {
    this.forceLogoutCallback = callback;
  }

  /** Update the in-memory access token (called after login or refresh). */
  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  // ---------------------------------------------------------------------------
  // Typed convenience methods
  // ---------------------------------------------------------------------------

  async getJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.request(url, { ...init, method: "GET" });
    return response.json() as Promise<T>;
  }

  async postJson<T>(
    url: string,
    body: unknown,
    init?: RequestInit,
  ): Promise<T> {
    const response = await this.request(url, {
      ...init,
      method: "POST",
      body: JSON.stringify(body),
    });
    return response.json() as Promise<T>;
  }

  async putJson<T>(url: string, body: unknown, init?: RequestInit): Promise<T> {
    const response = await this.request(url, {
      ...init,
      method: "PUT",
      body: JSON.stringify(body),
    });
    return response.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // Core request logic
  // ---------------------------------------------------------------------------

  /**
   * Executes a fetch request with automatic header injection and 401 retry.
   * Throws on network errors or non-2xx responses (except 401 which is retried).
   */
  async request(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetchWithHeaders(url, init);

    if (response.status === 401) {
      // The login endpoint itself can return 401 (bad credentials) — there is
      // no session to refresh in that case, so skip the retry logic entirely
      // and fall through to the normal error extraction path below.
      if (!url.includes("/auth/login")) {
        // --- 401 handling: attempt silent refresh then retry once ---
        const newToken = await this.silentRefresh();

        if (!newToken) {
          // Refresh failed — force logout and surface the 401 to the caller
          this.triggerForceLogout();
          throw new Error("Session expired. Please log in again.");
        }

        // Retry the original request with the refreshed token
        const retried = await this.fetchWithHeaders(url, init);
        if (!retried.ok) {
          throw new Error(`Request failed with status ${retried.status}`);
        }
        return retried;
      }
    }

    if (!response.ok) {
      // Try to extract a meaningful error message from the response body.
      let message = `Request failed with status ${response.status}`;
      try {
        const body = (await response.json()) as {
          message?: string;
          detail?: string;
        };
        message = body.message ?? body.detail ?? message;
      } catch {
        // ignore parse errors — use the default message
      }
      throw new Error(message);
    }

    return response;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchWithHeaders(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);

    // Content-Type for JSON bodies
    if (init.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    // Authorization header
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }

    // CSRF token for state-changing operations
    if (STATE_CHANGING_METHODS.has(method)) {
      const csrfToken = getCsrfTokenFromCookie();
      if (csrfToken) {
        headers.set("X-CSRF-Token", csrfToken);
      }
    }

    return fetch(url, { ...init, method, headers });
  }

  /**
   * Attempts a silent token refresh.
   * Deduplicates concurrent calls — only one refresh request is in-flight at a time.
   * Returns the new access token on success, or null on failure.
   */
  private silentRefresh(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private async doRefresh(): Promise<string | null> {
    try {
      // The refresh endpoint uses httpOnly cookies — no body needed.
      // We call fetch directly to avoid triggering another 401 retry loop.
      const response = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { accessToken?: string };
      const newToken = data.accessToken ?? null;

      if (newToken) {
        this.accessToken = newToken;
      }

      return newToken;
    } catch {
      return null;
    }
  }

  private triggerForceLogout(): void {
    this.accessToken = null;
    if (this.forceLogoutCallback) {
      this.forceLogoutCallback();
    }
  }

  // ---------------------------------------------------------------------------
  // Test / reset helper (only for unit tests)
  // ---------------------------------------------------------------------------

  /** @internal Resets the singleton — use only in tests. */
  static _resetInstance(): void {
    HttpClient.instance = null;
  }
}
