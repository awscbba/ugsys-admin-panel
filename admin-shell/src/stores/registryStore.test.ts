/**
 * Tests for registryStore atoms and actions.
 * Requirements: 1.2, 1.7
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServiceRegistration } from "../domain/entities/ServiceRegistration";

vi.mock("../infrastructure/repositories/HttpRegistryRepository");

import { HttpRegistryRepository } from "../infrastructure/repositories/HttpRegistryRepository";
import {
  $services,
  $selectedService,
  loadServices,
  selectService,
  clearSelection,
} from "./registryStore";

const mockService: ServiceRegistration = {
  serviceName: "analytics",
  baseUrl: "http://analytics.internal",
  healthEndpoint: "/health",
  manifestUrl: "/manifest.json",
  manifest: null,
  minRole: "viewer",
  status: "active",
  version: 1,
  registeredAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  registeredBy: "system",
  registrationSource: "seed",
};

const mockService2: ServiceRegistration = {
  ...mockService,
  serviceName: "reporting",
  baseUrl: "http://reporting.internal",
};

const mockRepo = {
  listServices: vi.fn(),
  getConfigSchema: vi.fn(),
};

beforeEach(() => {
  $services.set([]);
  $selectedService.set(null);

  vi.clearAllMocks();

  vi.mocked(HttpRegistryRepository).mockImplementation(
    () => mockRepo as unknown as HttpRegistryRepository,
  );
});

describe("loadServices()", () => {
  it("populates $services on success", async () => {
    mockRepo.listServices.mockResolvedValue([mockService, mockService2]);

    await loadServices();

    expect($services.get()).toEqual([mockService, mockService2]);
  });

  it("replaces existing $services", async () => {
    $services.set([mockService]);
    mockRepo.listServices.mockResolvedValue([mockService2]);

    await loadServices();

    expect($services.get()).toEqual([mockService2]);
  });

  it("throws and propagates error on failure", async () => {
    mockRepo.listServices.mockRejectedValue(new Error("Network error"));

    await expect(loadServices()).rejects.toThrow("Network error");
  });

  it("does not modify $services on failure", async () => {
    $services.set([mockService]);
    mockRepo.listServices.mockRejectedValue(new Error("fail"));

    await expect(loadServices()).rejects.toThrow();

    expect($services.get()).toEqual([mockService]);
  });
});

describe("selectService()", () => {
  beforeEach(() => {
    $services.set([mockService, mockService2]);
  });

  it("sets $selectedService to the matching service", () => {
    selectService("analytics");
    expect($selectedService.get()).toEqual(mockService);
  });

  it("sets $selectedService to null when service not found", () => {
    selectService("nonexistent");
    expect($selectedService.get()).toBeNull();
  });

  it("updates $selectedService when called again", () => {
    selectService("analytics");
    selectService("reporting");
    expect($selectedService.get()).toEqual(mockService2);
  });
});

describe("clearSelection()", () => {
  it("sets $selectedService to null", () => {
    $selectedService.set(mockService);

    clearSelection();

    expect($selectedService.get()).toBeNull();
  });

  it("is a no-op when already null", () => {
    $selectedService.set(null);
    clearSelection();
    expect($selectedService.get()).toBeNull();
  });
});
