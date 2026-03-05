import type { AuditLogEntry } from '../entities/AuditLogEntry';

export interface AuditLogFilters {
  fromDate?: string;
  toDate?: string;
  actorUserId?: string;
  targetService?: string;
  httpMethod?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedAuditLogs {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditRepository {
  queryLogs(filters?: AuditLogFilters): Promise<PaginatedAuditLogs>;
}
