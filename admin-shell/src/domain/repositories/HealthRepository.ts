import type { HealthStatus } from "../entities/HealthStatus";

export interface HealthRepository {
  getHealthStatuses(): Promise<HealthStatus[]>;
}
