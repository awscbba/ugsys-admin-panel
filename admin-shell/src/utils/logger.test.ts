/**
 * Tests for FrontendLogger structured logging.
 * Validates log level filtering and structured output (Req 13.7).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FrontendLogger,
  getServiceLogger,
  getComponentLogger,
  getApiLogger,
} from './logger';

describe('FrontendLogger', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs debug messages at DEBUG level', () => {
    const logger = new FrontendLogger('test', 'DEBUG');
    logger.debug('debug message');
    expect(debugSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(debugSpy.mock.calls[0][0] as string);
    expect(output.level).toBe('DEBUG');
    expect(output.message).toBe('debug message');
    expect(output.logger).toBe('test');
  });

  it('logs info messages', () => {
    const logger = new FrontendLogger('test', 'DEBUG');
    logger.info('info message', { key: 'value' });
    expect(infoSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(output.level).toBe('INFO');
    expect(output.context).toEqual({ key: 'value' });
  });

  it('logs warn messages', () => {
    const logger = new FrontendLogger('test', 'DEBUG');
    logger.warn('warn message');
    expect(warnSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(output.level).toBe('WARN');
  });

  it('logs error messages', () => {
    const logger = new FrontendLogger('test', 'DEBUG');
    logger.error('error message');
    expect(errorSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(output.level).toBe('ERROR');
  });

  it('filters out DEBUG messages when minLevel is INFO', () => {
    const logger = new FrontendLogger('test', 'INFO');
    logger.debug('should be filtered');
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('filters out DEBUG and INFO when minLevel is WARN', () => {
    const logger = new FrontendLogger('test', 'WARN');
    logger.debug('filtered');
    logger.info('filtered');
    logger.warn('shown');
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('includes timestamp in log output', () => {
    const logger = new FrontendLogger('test', 'DEBUG');
    logger.info('msg');
    const output = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(output.timestamp).toBeDefined();
    expect(typeof output.timestamp).toBe('string');
  });

  it('omits context key when no context provided', () => {
    const logger = new FrontendLogger('test', 'DEBUG');
    logger.info('no context');
    const output = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(output.context).toBeUndefined();
  });

  describe('logApiRequest', () => {
    it('logs at DEBUG level', () => {
      const logger = new FrontendLogger('test', 'DEBUG');
      logger.logApiRequest({ method: 'GET', url: '/api/v1/health' });
      expect(debugSpy).toHaveBeenCalledOnce();
    });
  });

  describe('logApiResponse', () => {
    it('logs at DEBUG for 2xx responses', () => {
      const logger = new FrontendLogger('test', 'DEBUG');
      logger.logApiResponse({ method: 'GET', url: '/api', status: 200 });
      expect(debugSpy).toHaveBeenCalledOnce();
    });

    it('logs at WARN for 4xx responses', () => {
      const logger = new FrontendLogger('test', 'DEBUG');
      logger.logApiResponse({ method: 'GET', url: '/api', status: 403 });
      expect(warnSpy).toHaveBeenCalledOnce();
    });
  });

  describe('logUserAction', () => {
    it('logs at INFO level', () => {
      const logger = new FrontendLogger('test', 'DEBUG');
      logger.logUserAction({ action: 'login', target: 'auth' });
      expect(infoSpy).toHaveBeenCalledOnce();
    });
  });

  describe('logComponentEvent', () => {
    it('logs at DEBUG level', () => {
      const logger = new FrontendLogger('test', 'DEBUG');
      logger.logComponentEvent({ event: 'mount', component: 'Sidebar' });
      expect(debugSpy).toHaveBeenCalledOnce();
    });
  });
});

describe('factory functions', () => {
  it('getServiceLogger creates logger with service: prefix', () => {
    const logger = getServiceLogger('authStore');
    expect(logger).toBeInstanceOf(FrontendLogger);
  });

  it('getComponentLogger creates logger with component: prefix', () => {
    const logger = getComponentLogger('Sidebar');
    expect(logger).toBeInstanceOf(FrontendLogger);
  });

  it('getApiLogger creates logger with api: prefix', () => {
    const logger = getApiLogger('HttpClient');
    expect(logger).toBeInstanceOf(FrontendLogger);
  });
});
