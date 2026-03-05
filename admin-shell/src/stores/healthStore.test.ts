/**
 * Tests for healthStore atoms and actions.
 * Requirements: 1.2, 1.7
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HealthStatus } from "../domain/entities/HealthStatus";

vi.mock("../infrastructure/repositories/HttpHealthRepository");

import { HttpHealthRepository } from "../infrastructure/repositories/HttpHealthRepository";
import { $healthStatuses, loadHealthStatuses } from "./healthStore";

const mockStatuses: HealthStatus[] = [
  {
    serviceName: "analytics",
    status: "healthy",
    lastCheck: "2024-01-01T00:00:00Z",
    responseTimeMs: 42,
    version: "1.0.0",
    statusCode: 200,
  },
  {
    serviceName: "reporting",
    status: "degraded",
    lastCheck: "2024-01-01T00:00:00Z",
    responseTimeMs: 1500,
    version: "2.1.0",
    statusCode: 200,
  },
];

const mockRepo = {
  getHealthStatuses: vi.fn(),
};

beforeEach(() => {
  $healthStatuses.set({});

  vi.clearAllMocks();

  vi.mocked(HttpHealthRepository).mockImplementation(
    () => mockRepo as unknown as HttpHealthRepository,
  );
});

describe("loadHealthStatuses()", () => {
  it("populates $healthStatuses keyed by serviceName", async () => {
    mockRepo.getHealthStatuses.mockResolvedValue(mockStatuses);

    await loadHealthStatuses();

    const result = $healthStatuses.get();
    expect(result["analytics"]).toEqual(mockStatuses[0]);
    expect(result["reporting"]).toEqual(mockStatuses[1]);
  });

  it("replaces existing $healthStatuses", async () => {
    $healthStatuses.set({ old: mockStatuses[0] as HealthStatus });
    mockRepo.getHealthStatuses.mockResolvedValue([mockStatuses[1]]);

    await loadHealthStatuses();

    const result = $healthStatuses.get();
    expect(result["old"]).toBeUndefined();
    expect(result["reporting"]).toEqual(mockStatuses[1]);
  });

  it("handles empty array — sets empty map", async () => {
    mockRepo.getHealthStatuses.mockResolvedValue([]);

    await loadHealthStatuses();

    expect($healthStatuses.get()).toEqual({});
  });

  it("throws and propagates error on failure", async () => {
    mockRepo.getHealthStatuses.mockRejectedValue(
      new Error("Service unavailable"),
    );

    await expect(loadHealthStatuses()).rejects.toThrow("Service unavailable");
  });

  it("does not modify $healthStatuses on failure", async () => {
    const existing = { analytics: mockStatuses[0] };
    $healthStatuses.set(existing);
    mockRepo.getHealthStatuses.mockRejectedValue(new Error("fail"));

    await expect(loadHealthStatuses()).rejects.toThrow();

    expect($healthStatuses.get()).toEqual(existing);
  });
});
