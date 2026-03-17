const BASE_PATH = '/app/projects-registry';

export type ViewName =
  | 'dashboard'
  | 'project-list'
  | 'project-create'
  | 'project-detail'
  | 'project-edit'
  | 'subscription-manager'
  | 'form-schema-editor'
  | 'not-found';

export interface RouteMatch {
  view: ViewName;
  params?: Record<string, string>;
}

export interface QueryState {
  page?: number;
  page_size?: number;
  status?: string;
  category?: string;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export function matchRoute(pathname: string): RouteMatch {
  // Strip the base path prefix
  let relative = pathname;
  if (relative.startsWith(BASE_PATH)) {
    relative = relative.slice(BASE_PATH.length);
  }

  // Remove trailing slash (but keep '/' as-is)
  if (relative.length > 1 && relative.endsWith('/')) {
    relative = relative.slice(0, -1);
  }

  // Dashboard routes
  if (relative === '' || relative === '/' || relative === '/dashboard') {
    return { view: 'dashboard' };
  }

  // Static routes first (before parameterized)
  if (relative === '/projects') {
    return { view: 'project-list' };
  }

  if (relative === '/projects/new') {
    return { view: 'project-create' };
  }

  // Parameterized routes — /projects/:id/...
  const projectSubRouteMatch = relative.match(/^\/projects\/([^/]+)\/(.+)$/);
  if (projectSubRouteMatch) {
    const id = projectSubRouteMatch[1];
    const sub = projectSubRouteMatch[2];

    if (sub === 'edit') {
      return { view: 'project-edit', params: { id } };
    }
    if (sub === 'subscriptions') {
      return { view: 'subscription-manager', params: { id } };
    }
    if (sub === 'form-schema') {
      return { view: 'form-schema-editor', params: { id } };
    }

    return { view: 'not-found' };
  }

  // /projects/:id (detail)
  const projectDetailMatch = relative.match(/^\/projects\/([^/]+)$/);
  if (projectDetailMatch) {
    const id = projectDetailMatch[1];
    // Guard against 'new' being caught here (already handled above, but defensive)
    if (id === 'new') {
      return { view: 'project-create' };
    }
    return { view: 'project-detail', params: { id } };
  }

  return { view: 'not-found' };
}

export function serializeQueryParams(state: QueryState): string {
  const params = new URLSearchParams();

  if (state.page != null) params.set('page', String(state.page));
  if (state.page_size != null) params.set('page_size', String(state.page_size));
  if (state.status) params.set('status', state.status);
  if (state.category) params.set('category', state.category);
  if (state.search) params.set('search', state.search);
  if (state.sort_by) params.set('sort_by', state.sort_by);
  if (state.sort_order) params.set('sort_order', state.sort_order);

  const str = params.toString();
  return str ? `?${str}` : '';
}

export function parseQueryParams(search: string): QueryState {
  const params = new URLSearchParams(search);
  const state: QueryState = {};

  const page = params.get('page');
  if (page) state.page = Number(page);

  const pageSize = params.get('page_size');
  if (pageSize) state.page_size = Number(pageSize);

  const status = params.get('status');
  if (status) state.status = status;

  const category = params.get('category');
  if (category) state.category = category;

  const searchParam = params.get('search');
  if (searchParam) state.search = searchParam;

  const sortBy = params.get('sort_by');
  if (sortBy) state.sort_by = sortBy;

  const sortOrder = params.get('sort_order');
  if (sortOrder === 'asc' || sortOrder === 'desc') state.sort_order = sortOrder;

  return state;
}
