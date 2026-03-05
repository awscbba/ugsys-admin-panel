/**
 * Tests for API_CONFIG object shape.
 * Validates all endpoint paths are correctly defined.
 */

import { describe, it, expect } from "vitest";
import { API_CONFIG } from "./api";

describe("API_CONFIG", () => {
  describe("auth endpoints", () => {
    it("has login endpoint", () => {
      expect(API_CONFIG.auth.login).toBe("/api/v1/auth/login");
    });

    it("has logout endpoint", () => {
      expect(API_CONFIG.auth.logout).toBe("/api/v1/auth/logout");
    });

    it("has refresh endpoint", () => {
      expect(API_CONFIG.auth.refresh).toBe("/api/v1/auth/refresh");
    });

    it("has me endpoint", () => {
      expect(API_CONFIG.auth.me).toBe("/api/v1/auth/me");
    });
  });

  describe("registry endpoints", () => {
    it("has services endpoint", () => {
      expect(API_CONFIG.registry.services).toBe("/api/v1/registry/services");
    });

    it("generates serviceConfigSchema URL with service name", () => {
      expect(API_CONFIG.registry.serviceConfigSchema("my-service")).toBe(
        "/api/v1/registry/services/my-service/config-schema",
      );
    });
  });

  describe("health endpoints", () => {
    it("has services endpoint", () => {
      expect(API_CONFIG.health.services).toBe("/api/v1/health/services");
    });
  });

  describe("users endpoints", () => {
    it("has list endpoint", () => {
      expect(API_CONFIG.users.list).toBe("/api/v1/users");
    });

    it("generates updateRoles URL with userId", () => {
      expect(API_CONFIG.users.updateRoles("user-123")).toBe(
        "/api/v1/users/user-123/roles",
      );
    });

    it("generates updateStatus URL with userId", () => {
      expect(API_CONFIG.users.updateStatus("user-456")).toBe(
        "/api/v1/users/user-456/status",
      );
    });
  });

  describe("audit endpoints", () => {
    it("has logs endpoint", () => {
      expect(API_CONFIG.audit.logs).toBe("/api/v1/audit/logs");
    });
  });

  describe("proxy endpoints", () => {
    it("generates proxy request URL", () => {
      expect(API_CONFIG.proxy.request("svc", "some/path")).toBe(
        "/api/v1/proxy/svc/some/path",
      );
    });

    it("generates proxy config URL", () => {
      expect(API_CONFIG.proxy.config("svc")).toBe("/api/v1/proxy/svc/config");
    });
  });
});
