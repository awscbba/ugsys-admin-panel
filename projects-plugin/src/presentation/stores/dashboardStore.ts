import { atom } from 'nanostores';
import type { EnhancedDashboardData, AnalyticsData } from '@domain/entities/Dashboard';
import type { ProjectsRepository } from '@domain/repositories/ProjectsRepository';

export interface DashboardState {
  metrics: EnhancedDashboardData | null;
  analytics: AnalyticsData | null;
  loading: boolean;
  error: string | null;
}

export const INITIAL_DASHBOARD_STATE: DashboardState = {
  metrics: null,
  analytics: null,
  loading: false,
  error: null,
};

export const dashboardStore = atom<DashboardState>({ ...INITIAL_DASHBOARD_STATE });

export async function loadDashboard(client: ProjectsRepository): Promise<void> {
  dashboardStore.set({ ...dashboardStore.get(), loading: true, error: null });

  try {
    const [metrics, analytics] = await Promise.all([
      client.getDashboard(),
      client.getAnalytics(),
    ]);
    dashboardStore.set({ metrics, analytics, loading: false, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load dashboard';
    dashboardStore.set({ ...dashboardStore.get(), loading: false, error: message });
  }
}
