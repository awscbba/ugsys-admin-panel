import { atom } from 'nanostores';
import type { Project } from '@domain/entities/Project';
import type { ProjectsRepository } from '@domain/repositories/ProjectsRepository';

export interface ProjectListState {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
  filters: {
    status?: string;
    category?: string;
    search?: string;
  };
  sort: {
    sort_by: string;
    sort_order: 'asc' | 'desc';
  };
  loading: boolean;
  error: string | null;
}

export const INITIAL_PROJECT_LIST_STATE: ProjectListState = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  filters: {},
  sort: {
    sort_by: 'created_at',
    sort_order: 'desc',
  },
  loading: false,
  error: null,
};

export const projectListStore = atom<ProjectListState>({ ...INITIAL_PROJECT_LIST_STATE });

let currentController: AbortController | null = null;

export async function loadProjects(client: ProjectsRepository, signal?: AbortSignal): Promise<void> {
  // Abort any in-flight request
  if (currentController) {
    currentController.abort();
  }
  currentController = new AbortController();
  const internalSignal = currentController.signal;

  const state = projectListStore.get();
  projectListStore.set({ ...state, loading: true, error: null });

  try {
    const result = await client.listProjects({
      page: state.page,
      page_size: state.pageSize,
      status: state.filters.status as import('@domain/entities/Project').ProjectStatus | undefined,
      category: state.filters.category,
      search: state.filters.search,
      sort_by: state.sort.sort_by,
      sort_order: state.sort.sort_order,
    });

    // Check if aborted before updating state
    if (internalSignal.aborted || signal?.aborted) return;

    projectListStore.set({
      ...projectListStore.get(),
      items: result.items,
      total: result.total,
      page: result.page,
      loading: false,
      error: null,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    if (internalSignal.aborted || signal?.aborted) return;

    const message = err instanceof Error ? err.message : 'Failed to load projects';
    projectListStore.set({
      ...projectListStore.get(),
      loading: false,
      error: message,
    });
  }
}

export function setFilters(filters: Partial<ProjectListState['filters']>): void {
  const state = projectListStore.get();
  projectListStore.set({
    ...state,
    filters: { ...state.filters, ...filters },
    page: 1, // Reset to first page on filter change
  });
}

export function setSort(sort: Partial<ProjectListState['sort']>): void {
  const state = projectListStore.get();
  projectListStore.set({
    ...state,
    sort: { ...state.sort, ...sort },
    page: 1,
  });
}

export function setPage(page: number): void {
  const state = projectListStore.get();
  projectListStore.set({ ...state, page });
}

export function setPageSize(pageSize: number): void {
  const state = projectListStore.get();
  projectListStore.set({ ...state, pageSize, page: 1 });
}
