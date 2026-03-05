import type {
  ServiceRegistration,
  PluginManifest,
  RouteDescriptor,
  NavigationEntry,
  ServiceStatus,
  RegistrationSource,
} from '../../domain/entities/ServiceRegistration';
import type { RegistryRepository } from '../../domain/repositories/RegistryRepository';
import { HttpClient } from '../http/HttpClient';

interface RouteDescriptorDto {
  path: string;
  required_roles: string[];
  label: string;
}

interface NavigationEntryDto {
  label: string;
  icon: string;
  path: string;
  required_roles: string[];
  group?: string;
  order?: number;
}

interface PluginManifestDto {
  name: string;
  version: string;
  entryPoint: string;
  routes: RouteDescriptorDto[];
  navigation: NavigationEntryDto[];
  stylesheetUrl?: string;
  configSchema?: Record<string, unknown>;
  healthEndpoint?: string;
  requiredPermissions?: string[];
}

interface ServiceRegistrationDto {
  service_name: string;
  base_url: string;
  health_endpoint: string;
  manifest_url: string;
  manifest: PluginManifestDto | null;
  min_role: string;
  status: string;
  version: number;
  registered_at: string;
  updated_at: string;
  registered_by: string;
  registration_source: string;
}

function mapRoute(dto: RouteDescriptorDto): RouteDescriptor {
  return {
    path: dto.path,
    requiredRoles: dto.required_roles,
    label: dto.label,
  };
}

function mapNavEntry(dto: NavigationEntryDto): NavigationEntry {
  return {
    label: dto.label,
    icon: dto.icon,
    path: dto.path,
    requiredRoles: dto.required_roles,
    group: dto.group,
    order: dto.order,
  };
}

function mapManifest(dto: PluginManifestDto): PluginManifest {
  return {
    name: dto.name,
    version: dto.version,
    entryPoint: dto.entryPoint,
    routes: dto.routes.map(mapRoute),
    navigation: dto.navigation.map(mapNavEntry),
    stylesheetUrl: dto.stylesheetUrl,
    configSchema: dto.configSchema,
    healthEndpoint: dto.healthEndpoint,
    requiredPermissions: dto.requiredPermissions,
  };
}

function mapServiceRegistration(dto: ServiceRegistrationDto): ServiceRegistration {
  return {
    serviceName: dto.service_name,
    baseUrl: dto.base_url,
    healthEndpoint: dto.health_endpoint,
    manifestUrl: dto.manifest_url,
    manifest: dto.manifest ? mapManifest(dto.manifest) : null,
    minRole: dto.min_role,
    status: dto.status as ServiceStatus,
    version: dto.version,
    registeredAt: dto.registered_at,
    updatedAt: dto.updated_at,
    registeredBy: dto.registered_by,
    registrationSource: dto.registration_source as RegistrationSource,
  };
}

export class HttpRegistryRepository implements RegistryRepository {
  private readonly http: HttpClient;

  constructor() {
    this.http = HttpClient.getInstance();
  }

  async listServices(): Promise<ServiceRegistration[]> {
    const data = await this.http.getJson<ServiceRegistrationDto[]>(
      '/api/v1/registry/services',
    );
    return data.map(mapServiceRegistration);
  }

  async getConfigSchema(serviceName: string): Promise<Record<string, unknown>> {
    return this.http.getJson<Record<string, unknown>>(
      `/api/v1/registry/services/${encodeURIComponent(serviceName)}/config-schema`,
    );
  }
}
