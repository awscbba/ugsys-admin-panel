import type { ProjectStatus } from './Project';

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface PaginatedQuery {
  page: number;
  page_size: number;
  status?: ProjectStatus;
  category?: string;
  search?: string;
  sort_by: string;
  sort_order: 'asc' | 'desc';
}
