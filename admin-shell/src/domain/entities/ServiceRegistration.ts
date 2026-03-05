export type ServiceStatus = "active" | "degraded" | "inactive";
export type RegistrationSource = "seed" | "api";

export interface PluginManifest {
  name: string;
  version: string;
  entryPoint: string;
  routes: RouteDescriptor[];
  navigation: NavigationEntry[];
  stylesheetUrl?: string;
  configSchema?: Record<string, unknown>;
  healthEndpoint?: string;
  requiredPermissions?: string[];
}

export interface RouteDescriptor {
  path: string;
  requiredRoles: string[];
  label: string;
}

export interface NavigationEntry {
  label: string;
  icon: string;
  path: string;
  requiredRoles: string[];
  group?: string;
  order?: number;
}

export interface ServiceRegistration {
  serviceName: string;
  baseUrl: string;
  healthEndpoint: string;
  manifestUrl: string;
  manifest: PluginManifest | null;
  minRole: string;
  status: ServiceStatus;
  version: number;
  registeredAt: string;
  updatedAt: string;
  registeredBy: string;
  registrationSource: RegistrationSource;
}
