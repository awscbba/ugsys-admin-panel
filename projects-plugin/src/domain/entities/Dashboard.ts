import type { Subscription } from './Subscription';

export interface ProjectStats {
  project_id: string;
  project_name: string;
  subscription_count: number;
  active_count: number;
  pending_count: number;
}

export interface EnhancedDashboardData {
  total_projects: number;
  total_subscriptions: number;
  total_form_submissions: number;
  active_projects: number;
  pending_subscriptions: number;
  per_project_stats: ProjectStats[];
  recent_signups: Subscription[];
}

export interface AnalyticsData {
  subscriptions_by_status: Record<string, number>;
  projects_by_status: Record<string, number>;
  subscriptions_by_project: Record<string, number>;
}
