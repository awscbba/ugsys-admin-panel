export type HealthState = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface HealthStatus {
  serviceName: string;
  status: HealthState;
  lastCheck: string;
  responseTimeMs: number;
  version: string;
  statusCode?: number;
}
