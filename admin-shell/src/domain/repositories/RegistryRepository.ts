import type { ServiceRegistration } from "../entities/ServiceRegistration";

export interface RegistryRepository {
  listServices(): Promise<ServiceRegistration[]>;
  getConfigSchema(serviceName: string): Promise<Record<string, unknown>>;
}
