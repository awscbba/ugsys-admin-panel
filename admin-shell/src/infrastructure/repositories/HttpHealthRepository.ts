import type { HealthStatus, HealthState } from '../../domain/entities/HealthStatus';
import type { HealthRepository } from '../../domain/repositories/HealthRepository';
import { HttpClient } from '../http/HttpClient';

interface HealthStatusDto {
  service_name: string;
  status: string;
  last_check: string;
  response_time_ms: number;
  version: string;
  status_code?: number;
}

function mapHealthStatus(dto: HealthStatusDto): HealthStatus {
  return {
    serviceName: dto.service_name,
    status: dto.status as HealthState,
    lastCheck: dto.last_check,
    responseTimeMs: dto.response_time_ms,
    version: dto.version,
    statusCode: dto.status_code,
  };
}

export class HttpHealthRepository implements HealthRepository {
  private readonly http: HttpClient;

  constructor() {
    this.http = HttpClient.getInstance();
  }

  async getHealthStatuses(): Promise<HealthStatus[]> {
    const data = await this.http.getJson<HealthStatusDto[]>(
      '/api/v1/health/services',
    );
    return data.map(mapHealthStatus);
  }
}
