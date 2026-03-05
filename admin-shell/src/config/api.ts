/**
 * Centralized API configuration for the BFF (Backend for Frontend) endpoints.
 */

export const API_CONFIG = {
  auth: {
    login: "/api/v1/auth/login" as const,
    logout: "/api/v1/auth/logout" as const,
    refresh: "/api/v1/auth/refresh" as const,
    me: "/api/v1/auth/me" as const,
  },

  registry: {
    services: "/api/v1/registry/services" as const,
    serviceConfigSchema: (serviceName: string) =>
      `/api/v1/registry/services/${serviceName}/config-schema`,
  },

  health: {
    services: "/api/v1/health/services" as const,
  },

  users: {
    list: "/api/v1/users" as const,
    updateRoles: (userId: string) => `/api/v1/users/${userId}/roles`,
    updateStatus: (userId: string) => `/api/v1/users/${userId}/status`,
  },

  audit: {
    logs: "/api/v1/audit/logs" as const,
  },

  proxy: {
    request: (serviceName: string, path: string) =>
      `/api/v1/proxy/${serviceName}/${path}`,
    config: (serviceName: string) => `/api/v1/proxy/${serviceName}/config`,
  },
} as const;

export type ApiConfig = typeof API_CONFIG;
