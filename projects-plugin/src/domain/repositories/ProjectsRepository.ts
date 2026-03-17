import type { Project, CreateProjectData, ProjectUpdateData } from '../entities/Project';
import type { Subscription } from '../entities/Subscription';
import type { CustomField, FormSchema } from '../entities/FormSchema';
import type { EnhancedDashboardData, AnalyticsData } from '../entities/Dashboard';
import type { PaginatedResponse, PaginatedQuery } from '../entities/Pagination';

export interface ProjectsRepository {
  listProjects(query: PaginatedQuery): Promise<PaginatedResponse<Project>>;
  createProject(data: CreateProjectData): Promise<Project>;
  getProject(id: string): Promise<Project>;
  getEnhancedProject(id: string): Promise<Project>;
  updateProject(id: string, data: Partial<ProjectUpdateData>): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  listSubscriptions(projectId: string, page: number, pageSize: number): Promise<PaginatedResponse<Subscription>>;
  approveSubscription(projectId: string, subscriptionId: string): Promise<Subscription>;
  rejectSubscription(projectId: string, subscriptionId: string, reason?: string): Promise<Subscription>;
  cancelSubscription(projectId: string, subscriptionId: string): Promise<void>;
  updateFormSchema(projectId: string, fields: CustomField[]): Promise<FormSchema>;
  getDashboard(): Promise<EnhancedDashboardData>;
  getAnalytics(): Promise<AnalyticsData>;
}
