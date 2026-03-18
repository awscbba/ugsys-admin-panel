/**
 * Tests for HttpClient singleton HTTP client.
 * Requirements: 2.4, 2.5, 2.8
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "./HttpClient";

// Helper to build a minimal Response-like object
function makeResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  HttpClient._resetInstance();
  // Reset document.cookie
  Object.defineProperty(document, "cookie", {
    writable: true,
    value: "",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("singleton", () => {
  it("returns the same instance on repeated calls", () => {
    const a = HttpClient.getInstance();
    const b = HttpClient.getInstance();
    expect(a).toBe(b);
  });

  it("returns a new instance after _resetInstance()", () => {
    const a = HttpClient.getInstance();
    HttpClient._resetInstance();
    const b = HttpClient.getInstance();
    expect(a).not.toBe(b);
  });
});

describe("token management", () => {
  it("getAccessToken returns null initially", () => {
    const client = HttpClient.getInstance();
    expect(client.getAccessToken()).toBeNull();
  });

  it("setAccessToken stores the token", () => {
    const client = HttpClient.getInstance();
    client.setAccessToken("my-token");
    expect(client.getAccessToken()).toBe("my-token");
  });

  it("setAccessToken(null) clears the token", () => {
    const client = HttpClient.getInstance();
    client.setAccessToken("my-token");
    client.setAccessToken(null);
    expect(client.getAccessToken()).toBeNull();
  });
});

describe("Authorization header injection", () => {
  it("injects Bearer token when access token is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    client.setAccessToken("abc123");

    await client.request("/api/test");

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(init.headers.get("Authorization")).toBe("Bearer abc123");
  });

  it("does not inject Authorization header when no token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();

    await client.request("/api/test");

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(init.headers.get("Authorization")).toBeNull();
  });
});

describe("CSRF header injection", () => {
  it("injects X-CSRF-Token on POST when cookie is present", async () => {
    Object.defineProperty(document, "cookie", {
      writable: true,
      value: "csrf_token=my-csrf-value",
    });

    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    await client.request("/api/test", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(init.headers.get("X-CSRF-Token")).toBe("my-csrf-value");
  });

  it("injects X-CSRF-Token on PUT", async () => {
    Object.defineProperty(document, "cookie", {
      writable: true,
      value: "csrf_token=csrf-put",
    });

    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    await client.request("/api/test", {
      method: "PUT",
      body: JSON.stringify({}),
    });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(init.headers.get("X-CSRF-Token")).toBe("csrf-put");
  });

  it("injects X-CSRF-Token on DELETE", async () => {
    Object.defineProperty(document, "cookie", {
      writable: true,
      value: "csrf_token=csrf-delete",
    });

    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    await client.request("/api/test", { method: "DELETE" });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(init.headers.get("X-CSRF-Token")).toBe("csrf-delete");
  });

  it("does NOT inject X-CSRF-Token on GET", async () => {
    Object.defineProperty(document, "cookie", {
      writable: true,
      value: "csrf_token=csrf-value",
    });

    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    await client.request("/api/test", { method: "GET" });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(init.headers.get("X-CSRF-Token")).toBeNull();
  });

  it("does NOT inject X-CSRF-Token when cookie is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    await client.request("/api/test", { method: "POST", body: "{}" });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(init.headers.get("X-CSRF-Token")).toBeNull();
  });
});

describe("Content-Type header", () => {
  it("sets Content-Type to application/json when body is present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    await client.request("/api/test", {
      method: "POST",
      body: JSON.stringify({ x: 1 }),
    });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(init.headers.get("Content-Type")).toBe("application/json");
  });

  it("does not override existing Content-Type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    await client.request("/api/test", {
      method: "POST",
      body: "data",
      headers: { "Content-Type": "text/plain" },
    });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(init.headers.get("Content-Type")).toBe("text/plain");
  });
});

describe("401 retry with token refresh", () => {
  it("retries the original request after a successful refresh", async () => {
    const fetchMock = vi
      .fn()
      // First call: original request → 401
      .mockResolvedValueOnce(makeResponse(401))
      // Second call: refresh endpoint → 200 with new token
      .mockResolvedValueOnce(makeResponse(200, { accessToken: "new-token" }))
      // Third call: retried original request → 200
      .mockResolvedValueOnce(makeResponse(200, { data: "ok" }));

    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    client.setAccessToken("current-token"); // session exists — refresh path should fire
    const response = await client.request("/api/protected");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(response.status).toBe(200);
    // Token should be updated
    expect(client.getAccessToken()).toBe("new-token");
  });

  it("updates the access token after successful refresh", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(
        makeResponse(200, { accessToken: "refreshed-token" }),
      )
      .mockResolvedValueOnce(makeResponse(200));

    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    client.setAccessToken("current-token"); // session exists — refresh path should fire
    await client.request("/api/protected");

    expect(client.getAccessToken()).toBe("refreshed-token");
  });
});

describe("force logout on refresh failure", () => {
  it("calls forceLogout callback when refresh returns non-ok", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(makeResponse(401)); // refresh also fails

    vi.stubGlobal("fetch", fetchMock);

    const forceLogout = vi.fn();
    const client = HttpClient.getInstance();
    client.setAccessToken("active-token"); // session exists — refresh path should fire
    client.setForceLogoutCallback(forceLogout);

    await expect(client.request("/api/protected")).rejects.toThrow();

    expect(forceLogout).toHaveBeenCalledOnce();
  });

  it("clears access token when refresh fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(makeResponse(500));

    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    client.setAccessToken("old-token");
    client.setForceLogoutCallback(vi.fn());

    await expect(client.request("/api/protected")).rejects.toThrow();

    expect(client.getAccessToken()).toBeNull();
  });

  it("calls forceLogout when refresh request throws a network error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    vi.stubGlobal("fetch", fetchMock);

    const forceLogout = vi.fn();
    const client = HttpClient.getInstance();
    client.setAccessToken("active-token"); // session exists — refresh path should fire
    client.setForceLogoutCallback(forceLogout);

    await expect(client.request("/api/protected")).rejects.toThrow();

    expect(forceLogout).toHaveBeenCalledOnce();
  });

  it("throws when refresh fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(makeResponse(500));

    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    client.setAccessToken("active-token"); // session exists — refresh path should fire
    client.setForceLogoutCallback(vi.fn());

    await expect(client.request("/api/protected")).rejects.toThrow(
      "Session expired",
    );
  });

  it("does NOT trigger force logout on 401 from /auth/login — surfaces real error instead", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      makeResponse(401, {
        message: "Authentication failed or token is invalid.",
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const forceLogout = vi.fn();
    const client = HttpClient.getInstance();
    client.setForceLogoutCallback(forceLogout);

    await expect(
      client.request("/api/v1/auth/login", { method: "POST" }),
    ).rejects.toThrow("Authentication failed or token is invalid.");

    // force logout must NOT be called for login 401s
    expect(forceLogout).not.toHaveBeenCalled();
  });

  it("does NOT trigger force logout on 401 from /auth/me when no access token is set — surfaces real error instead", async () => {
    // Reproduces the production bug: POST /auth/login succeeds (200), then
    // GET /auth/me returns 401 (e.g. BFF cookie race). With no access token
    // set, there is no established session to refresh — the client must surface
    // the real server error, not "Session expired. Please log in again."
    const fetchMock = vi.fn().mockResolvedValueOnce(
      makeResponse(401, {
        message: "Authentication failed or token is invalid.",
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const forceLogout = vi.fn();
    const client = HttpClient.getInstance();
    // No setAccessToken call — simulates the unauthenticated state during login
    client.setForceLogoutCallback(forceLogout);

    await expect(client.request("/api/v1/auth/me")).rejects.toThrow(
      "Authentication failed or token is invalid.",
    );

    // Only one fetch call — no refresh attempt made
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(forceLogout).not.toHaveBeenCalled();
  });
});

describe("non-2xx error handling", () => {
  it("throws on 500 with message from response body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        makeResponse(500, { message: "Internal server error" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    await expect(client.request("/api/test")).rejects.toThrow(
      "Internal server error",
    );
  });

  it("throws on 403 with fallback message when body has no message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(403, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    await expect(client.request("/api/test")).rejects.toThrow(
      "Request failed with status 403",
    );
  });

  it("throws on 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(404, { message: "Not found" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    await expect(client.request("/api/test")).rejects.toThrow("Not found");
  });
});

describe("convenience methods", () => {
  it("getJson() calls GET and returns parsed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { id: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    const result = await client.getJson<{ id: number }>("/api/items");

    expect(result).toEqual({ id: 1 });
    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect((init.method as string).toUpperCase()).toBe("GET");
  });

  it("postJson() calls POST with serialized body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(201, { created: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    const result = await client.postJson<{ created: boolean }>("/api/items", {
      name: "test",
    });

    expect(result).toEqual({ created: true });
    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect((init.method as string).toUpperCase()).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "test" }));
  });

  it("putJson() calls PUT with serialized body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(200, { updated: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = HttpClient.getInstance();
    const result = await client.putJson<{ updated: boolean }>("/api/items/1", {
      name: "new",
    });

    expect(result).toEqual({ updated: true });
    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect((init.method as string).toUpperCase()).toBe("PUT");
  });
});
