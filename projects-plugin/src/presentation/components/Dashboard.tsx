import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { dashboardStore, loadDashboard } from '@presentation/stores/dashboardStore';
import type { ProjectsRepository } from '@domain/repositories/ProjectsRepository';

interface DashboardProps {
  client: ProjectsRepository;
  navigate: (path: string) => void;
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="bg-white dark:bg-[#1e2738] rounded-lg border border-gray-200 dark:border-[#2a3548] p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </article>
  );
}

function LoadingSkeleton() {
  return (
    <section aria-live="polite" aria-busy="true" className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" aria-hidden="true" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <div key={i} className="h-48 bg-gray-100 rounded-lg animate-pulse" aria-hidden="true" />
        ))}
      </div>
      <span className="sr-only">Loading dashboard data…</span>
    </section>
  );
}

function AnalyticsTable({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return (
      <article className="bg-white dark:bg-[#1e2738] rounded-lg border border-gray-200 dark:border-[#2a3548] p-4 shadow-sm">
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        <p className="text-sm text-gray-500">No data available.</p>
      </article>
    );
  }

  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <article className="bg-white dark:bg-[#1e2738] rounded-lg border border-gray-200 dark:border-[#2a3548] p-4 shadow-sm">
      <h2 className="text-lg font-medium mb-3">{title}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 font-medium text-gray-600 dark:text-[#94a3b8]">Status</th>
            <th className="text-right py-2 font-medium text-gray-600 dark:text-[#94a3b8]">Count</th>
            <th className="text-right py-2 font-medium text-gray-600 dark:text-[#94a3b8]">%</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([status, count]) => (
            <tr key={status} className="border-b last:border-b-0">
              <td className="py-2 capitalize">{status}</td>
              <td className="py-2 text-right">{count}</td>
              <td className="py-2 text-right">{total > 0 ? Math.round((count / total) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

export function Dashboard({ client, navigate }: DashboardProps) {
  const { metrics, analytics, loading, error } = useStore(dashboardStore);

  useEffect(() => {
    loadDashboard(client);
  }, [client]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <section className="space-y-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div role="alert" className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => loadDashboard(client)}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!metrics) return null;

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section aria-label="Summary metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-live="polite">
          <MetricCard label="Total Projects" value={metrics.total_projects} />
          <MetricCard label="Active Projects" value={metrics.active_projects} />
          <MetricCard label="Total Subscriptions" value={metrics.total_subscriptions} />
          <MetricCard label="Pending Subscriptions" value={metrics.pending_subscriptions} />
        </div>
      </section>

      {analytics && (
        <section aria-label="Analytics">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnalyticsTable title="Subscriptions by Status" data={analytics.subscriptions_by_status} />
            <AnalyticsTable title="Projects by Status" data={analytics.projects_by_status} />
          </div>
        </section>
      )}

      <nav aria-label="Quick actions" className="flex gap-3">
        <button
          type="button"
          onClick={() => navigate('/app/projects-registry/projects')}
          className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          View All Projects
        </button>
        <button
          type="button"
          onClick={() => navigate('/app/projects-registry/projects/new')}
          className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-[#3d4f6b] hover:bg-gray-50 dark:hover:bg-[#252f3f]"
        >
          Create Project
        </button>
      </nav>
    </main>
  );
}
