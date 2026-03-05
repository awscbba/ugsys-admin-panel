/**
 * healthStore — nanostores atom for aggregated service health state.
 *
 * Requirements: 1.2, 1.7
 *
 * Atoms:
 *   $healthStatuses  — map of service name → HealthStatus for quick lookup
 *
 * Actions:
 *   loadHealthStatuses() — fetch health data from the BFF and populate $healthStatuses
 */

import { atom } from 'nanostores';
import type { HealthStatus } from '../domain/entities/HealthStatus';
import { HttpHealthRepository } from '../infrastructure/repositories/HttpHealthRepository';
import { getServiceLogger } from '../utils/logger';

const logger = getServiceLogger('healthStore');

// ── Atoms ─────────────────────────────────────────────────────────────────

/** Keyed by serviceName for O(1) lookup in the health dashboard. */
export const $healthStatuses = atom<Record<string, HealthStatus>>({});

// ── Repository (lazy singleton) ───────────────────────────────────────────

let _repo: HttpHealthRepository | null = null;

function getRepo(): HttpHealthRepository {
  if (!_repo) {
    _repo = new HttpHealthRepository();
  }
  return _repo;
}

// ── Actions ───────────────────────────────────────────────────────────────

/**
 * Fetch aggregated health statuses from the BFF.
 * Replaces the current $healthStatuses map.
 */
export async function loadHealthStatuses(): Promise<void> {
  logger.debug('Loading health statuses');

  try {
    const statuses = await getRepo().getHealthStatuses();
    const statusMap = statuses.reduce<Record<string, HealthStatus>>(
      (acc, entry) => {
        acc[entry.serviceName] = entry;
        return acc;
      },
      {},
    );
    $healthStatuses.set(statusMap);
    logger.info('Health statuses loaded', { count: statuses.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load health statuses';
    logger.warn('Failed to load health statuses', { error: message });
    throw err;
  }
}
