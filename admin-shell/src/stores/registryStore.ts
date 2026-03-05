/**
 * registryStore — nanostores atoms for service registry state.
 *
 * Requirements: 1.2, 1.7
 *
 * Atoms:
 *   $services        — list of all ServiceRegistration entries visible to the user
 *   $selectedService — the service currently selected/focused in the UI, or null
 *
 * Actions:
 *   loadServices()   — fetch the service list from the BFF and populate $services
 *   selectService()  — set $selectedService by service name
 *   clearSelection() — clear $selectedService
 */

import { atom } from 'nanostores';
import type { ServiceRegistration } from '../domain/entities/ServiceRegistration';
import { HttpRegistryRepository } from '../infrastructure/repositories/HttpRegistryRepository';
import { getServiceLogger } from '../utils/logger';

const logger = getServiceLogger('registryStore');

// ── Atoms ─────────────────────────────────────────────────────────────────

export const $services = atom<ServiceRegistration[]>([]);
export const $selectedService = atom<ServiceRegistration | null>(null);

// ── Repository (lazy singleton) ───────────────────────────────────────────

let _repo: HttpRegistryRepository | null = null;

function getRepo(): HttpRegistryRepository {
  if (!_repo) {
    _repo = new HttpRegistryRepository();
  }
  return _repo;
}

// ── Actions ───────────────────────────────────────────────────────────────

/**
 * Fetch the list of registered services from the BFF.
 * Replaces the current $services value.
 */
export async function loadServices(): Promise<void> {
  logger.debug('Loading service registry');

  try {
    const services = await getRepo().listServices();
    $services.set(services);
    logger.info('Service registry loaded', { count: services.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load services';
    logger.warn('Failed to load service registry', { error: message });
    throw err;
  }
}

/**
 * Select a service by name from the current $services list.
 * If the service is not found, $selectedService is set to null.
 */
export function selectService(serviceName: string): void {
  const service = $services.get().find((s) => s.serviceName === serviceName) ?? null;
  $selectedService.set(service);
  logger.logUserAction({ action: 'selectService', target: serviceName });
}

/**
 * Clear the current service selection.
 */
export function clearSelection(): void {
  $selectedService.set(null);
  logger.debug('Service selection cleared');
}
