import { atom } from 'nanostores';
import type { Subscription } from '@domain/entities/Subscription';
import type { ProjectsRepository } from '@domain/repositories/ProjectsRepository';

export interface SubscriptionState {
  items: Subscription[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  actionLoading: string | null;
}

export const INITIAL_SUBSCRIPTION_STATE: SubscriptionState = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  loading: false,
  error: null,
  actionLoading: null,
};

export const subscriptionStore = atom<SubscriptionState>({ ...INITIAL_SUBSCRIPTION_STATE });

export async function loadSubscriptions(
  client: ProjectsRepository,
  projectId: string,
): Promise<void> {
  const state = subscriptionStore.get();
  subscriptionStore.set({ ...state, loading: true, error: null });

  try {
    const result = await client.listSubscriptions(projectId, state.page, state.pageSize);
    subscriptionStore.set({
      ...subscriptionStore.get(),
      items: result.items,
      total: result.total,
      loading: false,
      error: null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load subscriptions';
    subscriptionStore.set({
      ...subscriptionStore.get(),
      loading: false,
      error: message,
    });
  }
}

export async function approveSubscription(
  client: ProjectsRepository,
  projectId: string,
  subscriptionId: string,
): Promise<void> {
  subscriptionStore.set({ ...subscriptionStore.get(), actionLoading: subscriptionId, error: null });

  try {
    const updated = await client.approveSubscription(projectId, subscriptionId);
    const state = subscriptionStore.get();
    subscriptionStore.set({
      ...state,
      items: state.items.map((s) => (s.id === subscriptionId ? updated : s)),
      actionLoading: null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to approve subscription';
    subscriptionStore.set({ ...subscriptionStore.get(), actionLoading: null, error: message });
  }
}

export async function rejectSubscription(
  client: ProjectsRepository,
  projectId: string,
  subscriptionId: string,
  reason?: string,
): Promise<void> {
  subscriptionStore.set({ ...subscriptionStore.get(), actionLoading: subscriptionId, error: null });

  try {
    const updated = await client.rejectSubscription(projectId, subscriptionId, reason);
    const state = subscriptionStore.get();
    subscriptionStore.set({
      ...state,
      items: state.items.map((s) => (s.id === subscriptionId ? updated : s)),
      actionLoading: null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to reject subscription';
    subscriptionStore.set({ ...subscriptionStore.get(), actionLoading: null, error: message });
  }
}

export async function cancelSubscription(
  client: ProjectsRepository,
  projectId: string,
  subscriptionId: string,
): Promise<void> {
  subscriptionStore.set({ ...subscriptionStore.get(), actionLoading: subscriptionId, error: null });

  try {
    await client.cancelSubscription(projectId, subscriptionId);
    const state = subscriptionStore.get();
    subscriptionStore.set({
      ...state,
      items: state.items.filter((s) => s.id !== subscriptionId),
      total: state.total - 1,
      actionLoading: null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to cancel subscription';
    subscriptionStore.set({ ...subscriptionStore.get(), actionLoading: null, error: message });
  }
}
