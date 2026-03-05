/**
 * FrontendLogger — structured JSON logging for the Admin Shell.
 *
 * Requirement 13.7: Log authentication failures and admin actions with
 * structured output; never include credentials or tokens in log entries.
 *
 * Environment-aware:
 *   - Development (import.meta.env.DEV): DEBUG level and above
 *   - Production: INFO level and above
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  logger: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface ApiRequestContext {
  method: string;
  url: string;
  correlationId?: string;
  [key: string]: unknown;
}

export interface ApiResponseContext {
  method: string;
  url: string;
  status: number;
  durationMs?: number;
  correlationId?: string;
  [key: string]: unknown;
}

export interface UserActionContext {
  action: string;
  target?: string;
  [key: string]: unknown;
}

export interface ComponentEventContext {
  event: string;
  component: string;
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

function getMinLevel(): LogLevel {
  // Vite exposes import.meta.env.DEV at build time.
  // We guard with typeof to keep the module testable in Node environments.
  const isDev =
    typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  return isDev ? 'DEBUG' : 'INFO';
}

export class FrontendLogger {
  private readonly name: string;
  private readonly minLevel: LogLevel;

  constructor(name: string, minLevel?: LogLevel) {
    this.name = name;
    this.minLevel = minLevel ?? getMinLevel();
  }

  // ── Core log methods ──────────────────────────────────────────────────────

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('DEBUG', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('INFO', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('WARN', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('ERROR', message, context);
  }

  // ── Specialised methods ───────────────────────────────────────────────────

  logApiRequest(ctx: ApiRequestContext): void {
    this.debug('API request', { ...ctx });
  }

  logApiResponse(ctx: ApiResponseContext): void {
    const level: LogLevel = ctx.status >= 400 ? 'WARN' : 'DEBUG';
    this.log(level, 'API response', { ...ctx });
  }

  logUserAction(ctx: UserActionContext): void {
    this.info('User action', { ...ctx });
  }

  logComponentEvent(ctx: ComponentEventContext): void {
    this.debug('Component event', { ...ctx });
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      logger: this.name,
      message,
      ...(context !== undefined ? { context } : {}),
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case 'DEBUG':
        console.debug(output);
        break;
      case 'INFO':
        console.info(output);
        break;
      case 'WARN':
        console.warn(output);
        break;
      case 'ERROR':
        console.error(output);
        break;
    }
  }
}

// ── Factory functions ───────────────────────────────────────────────────────

/**
 * Logger for application-layer services (stores, use-cases).
 * Example: getServiceLogger('authStore')
 */
export function getServiceLogger(serviceName: string): FrontendLogger {
  return new FrontendLogger(`service:${serviceName}`);
}

/**
 * Logger for React components.
 * Example: getComponentLogger('Sidebar')
 */
export function getComponentLogger(componentName: string): FrontendLogger {
  return new FrontendLogger(`component:${componentName}`);
}

/**
 * Logger for HTTP / API infrastructure.
 * Example: getApiLogger('HttpClient')
 */
export function getApiLogger(clientName: string): FrontendLogger {
  return new FrontendLogger(`api:${clientName}`);
}
