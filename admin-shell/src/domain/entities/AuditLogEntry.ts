export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorDisplayName: string;
  action: string;
  targetService: string;
  targetPath: string;
  httpMethod: string;
  responseStatus: number;
  correlationId: string;
}
