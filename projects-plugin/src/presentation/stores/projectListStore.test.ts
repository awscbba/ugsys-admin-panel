/**
 * Tests for projectListStore — projects loading in the admin panel.
 * Covers: loadProjects happy path, error handling, abort, filter/sort/page helpers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Project } from '@domain/entities/Project';
import type { PaginatedResponse } from '@domain/entities/Pagination';
import type { ProjectsRepository } from '@domain/repositories/ProjectsRepository';
import {
  projectListStore,
  INITIAL_PROJECT_LIST_STATE,
  loadProjects,
  setFilters,
  setSort,
  setPage,
  setPageSize,
} from './projectListStore';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    description: 'A test project',
    rich_text: '',
    category: 'tech',
    status: 'active',
    is_enabled: true,
    max_participants: 10,
    current_participants: 2,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    created_by: 'user-1',
    notification_emails: [],
    images: [],
    form_schema: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePaginatedResponse(
  items: Project[],
  total = items.length,
  page = 1,
): PaginatedResponse<Project> {
  return { items, total, page, page_size: 20 };
}

// Minimal mock that satisfies ProjectsRepository
function makeClient(
  listProjectsImpl: () => Promise<PaginatedResponse<Project>>,
): ProjectsRepository {
  return {
    listProjects: vi.fn().mockImplementation(listProjectsImpl),
    createProject: vi.fn(),
    getProject: vi.fn(),
    getEnhancedProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    listSubscriptions: vi.fn(),
    approveSubscription: vi.fn(),
    rejectSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    updateFormSchema: vi.fn(),
    getDashboard: vi.fn(),
    getAnalytics: vi.fn(),
  } as unknown as ProjectsRepository;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  projectListStore.set({ ...INITIAL_PROJECT_LIST_STATE });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// loadProjects — happy path
// ---------------------------------------------------------------------------

describe('loadProjects — happy path', () => {
  it('sets loading: true while the request is in-flight', async () => {
    let resolveRequest!: (v: PaginatedResponse<Project>) => void;
    const pending = new Promise<PaginatedResponse<Project>>((res) => {
      resolveRequest = res;
    });
    const client = makeClient(() => pending);

    const promise = loadProjects(client);
    expect(projectListStore.get().loading).toBe(true);

    resolveRequest(makePaginatedResponse([]));
    await promise;
  });

  it('populates items and total on success', async () => {
    const projects = [makeProject({ id: 'p1' }), makeProject({ id: 'p2' })];
    const client = makeClient(() => Promise.resolve(makePaginatedResponse(projects, 5)));

    await loadProjects(client);

    const state = projectListStore.get();
    expect(state.items).toHaveLength(2);
    expect(state.total).toBe(5);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('passes current page, pageSize, filters and sort to the client', async () => {
    const client = makeClient(() => Promise.resolve(makePaginatedResponse([])));
    projectListStore.set({
      ...INITIAL_PROJECT_LIST_STATE,
      page: 2,
      pageSize: 10,
      filters: { status: 'active', category: 'tech' },
      sort: { sort_by: 'name', sort_order: 'asc' },
    });

    await loadProjects(client);

    expect(client.listProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        page_size: 10,
        status: 'active',
        category: 'tech',
        sort_by: 'name',
        sort_order: 'asc',
      }),
    );
  });

  it('clears error on successful reload after a previous error', async () => {
    projectListStore.set({ ...INITIAL_PROJECT_LIST_STATE, error: 'previous error' });
    const client = makeClient(() => Promise.resolve(makePaginatedResponse([])));

    await loadProjects(client);

    expect(projectListStore.get().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadProjects — error handling
// ---------------------------------------------------------------------------

describe('loadProjects — error handling', () => {
  it('sets error message and loading: false on API failure', async () => {
    const client = makeClient(() => Promise.reject(new Error('Network error')));

    await loadProjects(client);

    const state = projectListStore.get();
    expect(state.loading).toBe(false);
    expect(state.error).toBe('Network error');
    expect(state.items).toHaveLength(0);
  });

  it('uses fallback message for non-Error rejections', async () => {
    const client = makeClient(() => Promise.reject('oops'));

    await loadProjects(client);

    expect(projectListStore.get().error).toBe('Failed to load projects');
  });

  it('does not overwrite items on error — keeps previous items', async () => {
    const existing = [makeProject({ id: 'existing' })];
    projectListStore.set({ ...INITIAL_PROJECT_LIST_STATE, items: existing });

    const client = makeClient(() => Promise.reject(new Error('Boom')));
    await loadProjects(client);

    // items should be preserved (store spreads current state on error)
    expect(projectListStore.get().items).toEqual(existing);
  });
});

// ---------------------------------------------------------------------------
// loadProjects — abort / race condition
// ---------------------------------------------------------------------------

describe('loadProjects — abort', () => {
  it('ignores stale response when a second call aborts the first', async () => {
    let resolveFirst!: (v: PaginatedResponse<Project>) => void;
    const firstPending = new Promise<PaginatedResponse<Project>>((res) => {
      resolveFirst = res;
    });

    const staleProjects = [makeProject({ id: 'stale' })];
    const freshProjects = [makeProject({ id: 'fresh' })];

    const client = {
      listProjects: vi
        .fn()
        .mockReturnValueOnce(firstPending)
        .mockResolvedValueOnce(makePaginatedResponse(freshProjects)),
    } as unknown as ProjectsRepository;

    // Start first request (will be aborted)
    const first = loadProjects(client);
    // Start second request immediately — aborts the first
    const second = loadProjects(client);

    // Resolve the stale first request after the second has started
    resolveFirst(makePaginatedResponse(staleProjects));

    await Promise.all([first, second]);

    // Only the fresh result should be in the store
    expect(projectListStore.get().items).toEqual(freshProjects);
  });
});

// ---------------------------------------------------------------------------
// Filter / sort / pagination helpers
// ---------------------------------------------------------------------------

describe('setFilters', () => {
  it('merges new filters and resets page to 1', () => {
    projectListStore.set({ ...INITIAL_PROJECT_LIST_STATE, page: 3, filters: { status: 'active' } });

    setFilters({ category: 'tech' });

    const state = projectListStore.get();
    expect(state.filters).toEqual({ status: 'active', category: 'tech' });
    expect(state.page).toBe(1);
  });

  it('overwrites an existing filter key', () => {
    projectListStore.set({ ...INITIAL_PROJECT_LIST_STATE, filters: { status: 'active' } });

    setFilters({ status: 'completed' });

    expect(projectListStore.get().filters.status).toBe('completed');
  });
});

describe('setSort', () => {
  it('updates sort and resets page to 1', () => {
    projectListStore.set({ ...INITIAL_PROJECT_LIST_STATE, page: 2 });

    setSort({ sort_by: 'name', sort_order: 'asc' });

    const state = projectListStore.get();
    expect(state.sort).toEqual({ sort_by: 'name', sort_order: 'asc' });
    expect(state.page).toBe(1);
  });

  it('partially updates sort — preserves unchanged fields', () => {
    setSort({ sort_order: 'asc' });

    expect(projectListStore.get().sort).toEqual({ sort_by: 'created_at', sort_order: 'asc' });
  });
});

describe('setPage', () => {
  it('updates the page number', () => {
    setPage(4);
    expect(projectListStore.get().page).toBe(4);
  });
});

describe('setPageSize', () => {
  it('updates pageSize and resets page to 1', () => {
    projectListStore.set({ ...INITIAL_PROJECT_LIST_STATE, page: 3 });

    setPageSize(50);

    const state = projectListStore.get();
    expect(state.pageSize).toBe(50);
    expect(state.page).toBe(1);
  });
});
