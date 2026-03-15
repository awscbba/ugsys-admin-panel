/**
 * Tests for HttpUserProfileClient.
 *
 * Requirements: 1.7, 3.4, 4.3, 5.4, 6.4, 14.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http/HttpClient";
import { HttpUserProfileClient } from "./HttpUserProfileClient";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeResponse(status: number, body: unknown = {}): Response {
  // 204 No Content must have a null body — Response constructor rejects body + 204
  if (status === 204) {
    return new Response(null, { status: 200 });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SAMPLE_DTO = {
  user_id: "u1",
  full_name: "Alice Smith",
  date_of_birth: "1990-01-15",
  phone: "+591 70000000",
  street: "Calle 1",
  city: "Cochabamba",
  state: "Cbba",
  postal_code: "0000",
  country: "Bolivia",
  bio: "Hello world",
  display_name: "Alice",
  notification_email: true,
  notification_sms: false,
  notification_whatsapp: false,
  language: "es",
  timezone: "America/La_Paz",
};

beforeEach(() => {
  HttpClient._resetInstance();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── getProfile ────────────────────────────────────────────────────────────────

describe("getProfile", () => {
  it("maps all 15 snake_case fields to camelCase UpsProfile", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(200, SAMPLE_DTO)));

    const client = new HttpUserProfileClient();
    const profile = await client.getProfile("u1");

    expect(profile.userId).toBe("u1");
    expect(profile.fullName).toBe("Alice Smith");
    expect(profile.dateOfBirth).toBe("1990-01-15");
    expect(profile.phone).toBe("+591 70000000");
    expect(profile.street).toBe("Calle 1");
    expect(profile.city).toBe("Cochabamba");
    expect(profile.state).toBe("Cbba");
    expect(profile.postalCode).toBe("0000");
    expect(profile.country).toBe("Bolivia");
    expect(profile.bio).toBe("Hello world");
    expect(profile.displayName).toBe("Alice");
    expect(profile.notificationEmail).toBe(true);
    expect(profile.notificationSms).toBe(false);
    expect(profile.notificationWhatsapp).toBe(false);
    expect(profile.language).toBe("es");
    expect(profile.timezone).toBe("America/La_Paz");
  });

  it("calls GET /api/v1/users/{userId}/ups-profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, SAMPLE_DTO));
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpUserProfileClient();
    await client.getProfile("u1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/users/u1/ups-profile");
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
  });

  it("throws a not-found error on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeResponse(404, { message: "Not found" })),
    );

    const client = new HttpUserProfileClient();
    await expect(client.getProfile("missing")).rejects.toThrow();
  });

  it("throws on 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeResponse(500, { message: "Server error" })),
    );

    const client = new HttpUserProfileClient();
    await expect(client.getProfile("u1")).rejects.toThrow();
  });

  it("maps null fields correctly when server returns nulls", async () => {
    const dto = { ...SAMPLE_DTO, full_name: null, date_of_birth: null, bio: null };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(200, dto)));

    const client = new HttpUserProfileClient();
    const profile = await client.getProfile("u1");

    expect(profile.fullName).toBeNull();
    expect(profile.dateOfBirth).toBeNull();
    expect(profile.bio).toBeNull();
  });
});

// ── updatePersonal ────────────────────────────────────────────────────────────

describe("updatePersonal", () => {
  it("sends PATCH to /ups-profile/personal with snake_case body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(204));
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpUserProfileClient();
    await client.updatePersonal("u1", { fullName: "Bob", dateOfBirth: "1985-06-20" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/users/u1/ups-profile/personal");
    expect((init.method ?? "").toUpperCase()).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ full_name: "Bob", date_of_birth: "1985-06-20" });
  });

  it("omits undefined fields from body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(204));
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpUserProfileClient();
    await client.updatePersonal("u1", { fullName: "Bob" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ full_name: "Bob" });
    expect(body).not.toHaveProperty("date_of_birth");
  });
});

// ── updateContact ─────────────────────────────────────────────────────────────

describe("updateContact", () => {
  it("sends PATCH to /ups-profile/contact with snake_case body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(204));
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpUserProfileClient();
    await client.updateContact("u1", {
      phone: "+591",
      street: "Av. 1",
      city: "Cbba",
      state: "Cbba",
      postalCode: "0000",
      country: "Bolivia",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/users/u1/ups-profile/contact");
    expect((init.method ?? "").toUpperCase()).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      phone: "+591",
      street: "Av. 1",
      city: "Cbba",
      state: "Cbba",
      postal_code: "0000",
      country: "Bolivia",
    });
  });
});

// ── updateDisplay ─────────────────────────────────────────────────────────────

describe("updateDisplay", () => {
  it("sends PATCH to /ups-profile/display with snake_case body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(204));
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpUserProfileClient();
    await client.updateDisplay("u1", { bio: "Hello", displayName: "Alice" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/users/u1/ups-profile/display");
    expect((init.method ?? "").toUpperCase()).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ bio: "Hello", display_name: "Alice" });
  });
});

// ── updatePreferences ─────────────────────────────────────────────────────────

describe("updatePreferences", () => {
  it("sends PATCH to /ups-profile/preferences with snake_case body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(204));
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpUserProfileClient();
    await client.updatePreferences("u1", {
      notificationEmail: true,
      notificationSms: false,
      notificationWhatsapp: false,
      language: "es",
      timezone: "America/La_Paz",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/users/u1/ups-profile/preferences");
    expect((init.method ?? "").toUpperCase()).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      notification_email: true,
      notification_sms: false,
      notification_whatsapp: false,
      language: "es",
      timezone: "America/La_Paz",
    });
  });
});
