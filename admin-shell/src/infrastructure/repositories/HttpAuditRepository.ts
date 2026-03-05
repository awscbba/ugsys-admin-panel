import type { AuditLogEntry } from '../../domain/entities/AuditLogEntry';
import type {
  AuditRepository,
  AuditLogFilters,
  PaginatedAuditLogs,
} from '../../domain/repositories/AuditRepository';
import { HttpClient } from '../http/HttpClient';

interface AuditLogEntryDto {
  id: string;
  timestamp: string;
  actor_user_id: string;
  actor_display_name: string;
  action: string;
  target_service: string;
  target_path: string;
  http_method: string;
  response_status: number;
  correlation_id: string;
}

interface PaginatedAuditLogsDto {
  items: AuditLogEntryDto[];
  total: number;
  page: number;
  page_size: number;
}

function mapAuditLogEntry(dto: AuditLogEntryDto): AuditLogEntry {
  return {
    id: dto.id,
    timestamp: dto.timestamp,
    actorUserId: dto.actor_user_id,
    actorDisplayName: dto.actor_display_name,
    action: dto.action,
    targetService: dto.target_service,
    targetPath: dto.target_path,
    httpMethod: dto.http_method,
    responseStatus: dto.response_status,
    correlationId: dto.correlation_id,
  };
}

function buildQueryString(filters?: AuditLogFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.fromDate !== undefined) params.set('from_date', filters.fromDate);
  if (filters.toDate !== undefined) params.set('to_date', filters.toDate);
  if (filters.actorUserId !== undefined) params.set('actor_user_id', filters.actorUserId);
  if (filters.targetService !== undefined) params.set('target_service', filters.targetService);
  if (filters.httpMethod !== undefined) params.set('http_method', filters.httpMethod);
  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.pageSize !== undefined) params.set('page_size', String(filters.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export class HttpAuditRepository implements AuditRepository {
  private readonly http: HttpClient;

  constructor() {
    this.http = HttpClient.getInstance();
  }

  async queryLogs(filters?: AuditLogFilters): Promise<PaginatedAuditLogs> {
    const qs = buildQueryString(filters);
    const data = await this.http.getJson<PaginatedAuditLogsDto>(`/api/v1/audit/logs${qs}`);
    return {
      items: data.items.map(mapAuditLogEntry),
      total: data.total,
      page: data.page,
      pageSize: data.page_size,
    };
  }
}
