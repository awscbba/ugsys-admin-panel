import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  projectListStore,
  loadProjects,
  setFilters,
  setSort,
  setPage,
  setPageSize,
} from '@presentation/stores/projectListStore';
import { showToast } from '@presentation/stores/toastStore';
import { ConfirmDialog } from './ConfirmDialog';
import type { ProjectsRepository } from '@domain/repositories/ProjectsRepository';
import type { ProjectStatus } from '@domain/entities/Project';

interface ProjectListProps {
  client: ProjectsRepository;
  navigate: (path: string) => void;
}

const STATUS_COLORS: Record<ProjectStatus, string> = {
  pending: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
  active: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  completed: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  cancelled: 'bg-gray-100 dark:bg-slate-700/60 text-gray-500 dark:text-slate-400',
};

export function ProjectList({ client, navigate }: ProjectListProps) {
  const state = useStore(projectListStore);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadProjects(client);
    // Serialize objects to primitives so the effect only re-runs when values actually change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, state.page, state.pageSize, JSON.stringify(state.filters), JSON.stringify(state.sort)]);

  const handleSearchChange = useCallback(
    (value: string) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setFilters({ search: value || undefined }), 300);
    },
    [],
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await client.deleteProject(deleteTarget.id);
      showToast('Project deleted successfully', 'success');
      setDeleteTarget(null);
      loadProjects(client);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete project';
      showToast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(state.total / state.pageSize);

  if (state.loading && state.items.length === 0) {
    return (
      <div aria-live="polite" aria-busy="true" className="space-y-4">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div role="alert" className="text-center py-12">
        <p className="text-red-600 mb-4">{state.error}</p>
        <button
          type="button"
          onClick={() => loadProjects(client)}
          className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <button
          type="button"
          onClick={() => navigate('/app/projects-registry/projects/new')}
          className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Create Project
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search projects..."
          defaultValue={state.filters.search ?? ''}
          onChange={(e) => handleSearchChange(e.target.value)}
          aria-label="Search projects"
          className="px-3 py-2 text-sm border rounded-md w-48"
        />
        <select
          value={state.filters.status ?? ''}
          onChange={(e) => setFilters({ status: e.target.value || undefined })}
          aria-label="Filter by status"
          className="px-3 py-2 text-sm border rounded-md"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          type="text"
          placeholder="Category..."
          defaultValue={state.filters.category ?? ''}
          onChange={(e) => {
            clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(
              () => setFilters({ category: e.target.value || undefined }),
              300,
            );
          }}
          aria-label="Filter by category"
          className="px-3 py-2 text-sm border rounded-md w-40"
        />
        <select
          value={`${state.sort.sort_by}:${state.sort.sort_order}`}
          onChange={(e) => {
            const [sort_by, sort_order] = e.target.value.split(':');
            setSort({ sort_by, sort_order: sort_order as 'asc' | 'desc' });
          }}
          aria-label="Sort projects"
          className="px-3 py-2 text-sm border rounded-md"
        >
          <option value="created_at:desc">Newest first</option>
          <option value="created_at:asc">Oldest first</option>
          <option value="name:asc">Name A-Z</option>
          <option value="name:desc">Name Z-A</option>
          <option value="start_date:asc">Start date (earliest)</option>
          <option value="start_date:desc">Start date (latest)</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-[#2a3548]">
        <table className="w-full text-sm bg-white dark:bg-[#1e2738] text-gray-900 dark:text-[#e2e8f0]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-[#2a3548] text-left text-gray-500 dark:text-[#94a3b8]">
              <th className="py-2.5 px-3 font-medium">Name</th>
              <th className="py-2.5 px-3 font-medium">Category</th>
              <th className="py-2.5 px-3 font-medium">Status</th>
              <th className="py-2.5 px-3 font-medium">Enabled</th>
              <th className="py-2.5 px-3 font-medium">Participants</th>
              <th className="py-2.5 px-3 font-medium">Dates</th>
              <th className="py-2.5 px-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {state.items.map((project) => (
              <tr key={project.id} className="border-b border-gray-200 dark:border-[#2a3548] hover:bg-gray-50 dark:hover:bg-[#252f3f] transition-colors text-gray-900 dark:text-[#e2e8f0]">
                <td className="py-2.5 px-3 font-medium">{project.name}</td>
                <td className="py-2.5 px-3 text-gray-500 dark:text-[#94a3b8]">{project.category}</td>
                <td className="py-2.5 px-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[project.status]}`}
                    aria-label={`Status: ${project.status}`}
                  >
                    {project.status}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${project.is_enabled ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'}`}
                    aria-label={project.is_enabled ? 'Enabled' : 'Disabled'}
                  >
                    {project.is_enabled ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-gray-500 dark:text-[#94a3b8]">
                  {project.current_participants}/{project.max_participants}
                </td>
                <td className="py-2.5 px-3 text-xs text-gray-400 dark:text-[#64748b]">
                  {project.start_date} — {project.end_date}
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => navigate(`/app/projects-registry/projects/${project.id}`)}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-cyan-400 text-cyan-400 bg-transparent hover:bg-cyan-400/10 hover:shadow-[0_0_8px_rgba(34,211,238,0.4)] transition-all"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/app/projects-registry/projects/${project.id}/edit`)}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-amber-400 text-amber-400 bg-transparent hover:bg-amber-400/10 hover:shadow-[0_0_8px_rgba(251,191,36,0.4)] transition-all"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ id: project.id, name: project.name })}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-red-400 text-red-400 bg-transparent hover:bg-red-400/10 hover:shadow-[0_0_8px_rgba(248,113,113,0.4)] transition-all"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {state.items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#64748b]">
                  No projects found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Rows per page:</span>
          <select
            value={state.pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Page size"
            className="border rounded px-2 py-1"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <span>
            {state.total > 0
              ? `${(state.page - 1) * state.pageSize + 1}–${Math.min(state.page * state.pageSize, state.total)} of ${state.total}`
              : '0 results'}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={state.page <= 1}
            onClick={() => setPage(state.page - 1)}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40"
            aria-label="Previous page"
          >
            ←
          </button>
          <button
            type="button"
            disabled={state.page >= totalPages}
            onClick={() => setPage(state.page + 1)}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40"
            aria-label="Next page"
          >
            →
          </button>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Project"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
