import type { ProjectsRepository } from '@domain/repositories/ProjectsRepository';
import type { Project, CreateProjectData, ProjectUpdateData } from '@domain/entities/Project';
import type { Subscription } from '@domain/entities/Subscription';
import type { CustomField, FormSchema } from '@domain/entities/FormSchema';
import type { EnhancedDashboardData, AnalyticsData } from '@domain/entities/Dashboard';
import type { PaginatedResponse, PaginatedQuery } from '@domain/entities/Pagination';
import {
  ApiError,
  SessionExpiredError,
  AccessDeniedError,
  NotFoundError,
  ValidationError,
  ServerError,
} from '@domain/entities/Errors';

const PROXY_BASE = '/api/v1/proxy/projects-registry';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const FORBIDDEN_PATTERNS = [
  'Traceback',
  'DynamoDB',
  'ClientError',
  'File "',
  'File \'',
  '/src/',
  '/usr/',
  '/var/',
  '/home/',
  'botocore',
  'boto3',
  'node_modules',
  'at Object.',
  'at Module.',
  'at Function.',
];

const SAFE_FALLBACK_MESSAGE = 'An unexpected error occurred. Please try again.';

function sanitizeErrorMessage(message: string): string {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (message.includes(pattern)) {
      return SAFE_FALLBACK_MESSAGE;
    }
  }
  return message;
}

export class ProjectsApiClient implements ProjectsRepository {
  private getAccessToken: () => string | null;

  constructor(getAccessToken: () => string | null) {
    this.getAccessToken = getAccessToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `${PROXY_BASE}/${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = this.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    headers['X-Request-ID'] = crypto.randomUUID();

    if (STATE_CHANGING_METHODS.has(method.toUpperCase())) {
      const csrfToken = this.getCsrfTokenFromCookie();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (!response.ok) {
      throw await this.classifyError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const json = await response.json();
    return json.data ?? json;
  }

  private async classifyError(response: Response): Promise<ApiError> {
    let message = '';
    try {
      const body = await response.json();
      message = body.message ?? body.detail ?? '';
    } catch {
      // response body not parseable — use empty message
    }

    const safeMessage = sanitizeErrorMessage(message);

    switch (response.status) {
      case 401:
        return new SessionExpiredError();
      case 403:
        return new AccessDeniedError();
      case 404:
        return new NotFoundError();
      case 422:
        return new ValidationError(safeMessage || 'Validation failed');
      default:
        if (response.status >= 500 && response.status < 600) {
          return new ServerError();
        }
        return new ApiError(response.status, 'UNKNOWN_ERROR', safeMessage || SAFE_FALLBACK_MESSAGE);
    }
  }

  private getCsrfTokenFromCookie(): string | null {
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf_token='));
    return match ? decodeURIComponent(match.split('=')[1]) : null;
  }

  async listProjects(query: PaginatedQuery): Promise<PaginatedResponse<Project>> {
    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('page_size', String(query.page_size));
    if (query.status) params.set('status', query.status);
    if (query.category) params.set('category', query.category);
    if (query.search) params.set('search', query.search);
    params.set('sort_by', query.sort_by);
    params.set('sort_order', query.sort_order);
    return this.request<PaginatedResponse<Project>>('GET', `projects/?${params.toString()}`);
  }

  async createProject(data: CreateProjectData): Promise<Project> {
    return this.request<Project>('POST', 'projects/', data);
  }

  async getProject(id: string): Promise<Project> {
    return this.request<Project>('GET', `projects/${id}`);
  }

  async getEnhancedProject(id: string): Promise<Project> {
    return this.request<Project>('GET', `projects/${id}/enhanced`);
  }

  async updateProject(id: string, data: Partial<ProjectUpdateData>): Promise<Project> {
    return this.request<Project>('PUT', `projects/${id}`, data);
  }

  async deleteProject(id: string): Promise<void> {
    return this.request<void>('DELETE', `projects/${id}`);
  }

  async listSubscriptions(
    projectId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<Subscription>> {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    return this.request<PaginatedResponse<Subscription>>(
      'GET',
      `projects/${projectId}/subscriptions?${params.toString()}`,
    );
  }

  async approveSubscription(
    projectId: string,
    subscriptionId: string,
  ): Promise<Subscription> {
    return this.request<Subscription>(
      'PUT',
      `projects/${projectId}/subscribers/${subscriptionId}`,
      { action: 'approve' },
    );
  }

  async rejectSubscription(
    projectId: string,
    subscriptionId: string,
    reason?: string,
  ): Promise<Subscription> {
    return this.request<Subscription>(
      'PUT',
      `projects/${projectId}/subscribers/${subscriptionId}`,
      { action: 'reject', reason },
    );
  }

  async cancelSubscription(
    projectId: string,
    subscriptionId: string,
  ): Promise<void> {
    return this.request<void>(
      'DELETE',
      `projects/${projectId}/subscribers/${subscriptionId}`,
    );
  }

  async updateFormSchema(
    projectId: string,
    fields: CustomField[],
  ): Promise<FormSchema> {
    return this.request<FormSchema>(
      'PUT',
      `projects/${projectId}/form-schema`,
      { fields },
    );
  }

  async getDashboard(): Promise<EnhancedDashboardData> {
    return this.request<EnhancedDashboardData>('GET', 'admin/dashboard/enhanced');
  }

  async getAnalytics(): Promise<AnalyticsData> {
    return this.request<AnalyticsData>('GET', 'admin/analytics');
  }
}
