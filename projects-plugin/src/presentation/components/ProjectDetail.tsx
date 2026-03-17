import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { projectDetailStore, loadEnhancedProject, clearProject } from '@presentation/stores/projectDetailStore';
import { showToast } from '@presentation/stores/toastStore';
import { ConfirmDialog } from './ConfirmDialog';
import type { ProjectsApiClient } from '@infrastructure/api/ProjectsApiClient';
import type { ProjectStatus } from '@domain/entities/Project';

interface ProjectDetailProps {
  client: ProjectsApiClient;
  navigate: (path: string) => void;
  projectId: string;
}

const STATUS_COLORS: Record<ProjectStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export function ProjectDetail({ client, navigate, projectId }: ProjectDetailProps) {
  const { project, loading, error } = useStore(projectDetailStore);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadEnhancedProject(client, projectId);
    return () => clearProject();
  }, [client, projectId]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await client.deleteProject(projectId);
      showToast('Project deleted successfully', 'success');
      navigate('/app/projects-registry/projects');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete project';
      showToast(msg, 'error');
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (loading) {
    return (
      <div aria-live="polite" aria-busy="true" className="space-y-4 p-6">
        <div className="h-8 w-64 bg-gray-100 rounded animate-pulse" />
        <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
        <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
        <div className="h-4 w-1/2 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <div className="space-y-3">
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-5/6 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-5/6 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          type="button"
          onClick={() => loadEnhancedProject(client, projectId)}
          className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Project not found</p>
        <button
          type="button"
          onClick={() => navigate('/app/projects-registry/projects')}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header: name, status badge, category, enabled state, action buttons */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[project.status]}`}
              aria-label={`Status: ${project.status}`}
            >
              {project.status}
            </span>
            <span className="text-sm text-gray-500">{project.category}</span>
            <span
              className={`text-xs font-medium ${project.is_enabled ? 'text-green-600' : 'text-red-500'}`}
            >
              {project.is_enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(`/app/projects-registry/projects/${projectId}/edit`)}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => navigate(`/app/projects-registry/projects/${projectId}/subscriptions`)}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-gray-50"
          >
            Manage Subscriptions
          </button>
          <button
            type="button"
            onClick={() => navigate(`/app/projects-registry/projects/${projectId}/form-schema`)}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-gray-50"
          >
            Edit Form Schema
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className="px-3 py-1.5 text-sm rounded-md border text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Two-column detail grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-medium text-gray-500">Description</h2>
            <p className="mt-1 text-sm">{project.description}</p>
          </div>

          {project.rich_text && (
            <div>
              <h2 className="text-sm font-medium text-gray-500">Rich Text</h2>
              <div
                className="mt-1 text-sm prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: project.rich_text }}
              />
            </div>
          )}

          <div>
            <h2 className="text-sm font-medium text-gray-500">Dates</h2>
            <p className="mt-1 text-sm">
              {project.start_date} — {project.end_date}
            </p>
          </div>

          <div>
            <h2 className="text-sm font-medium text-gray-500">Participants</h2>
            <p className="mt-1 text-sm">
              {project.current_participants} / {project.max_participants}
            </p>
          </div>

          <div>
            <h2 className="text-sm font-medium text-gray-500">Created By</h2>
            <p className="mt-1 text-sm">{project.created_by}</p>
          </div>

          {project.notification_emails.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500">Notification Emails</h2>
              <ul className="mt-1 text-sm space-y-1">
                {project.notification_emails.map((email) => (
                  <li key={email}>{email}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Images as thumbnails */}
          {project.images.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500">Images</h2>
              <div className="flex flex-wrap gap-2 mt-1">
                {project.images.map((img) => (
                  <img
                    key={img.image_id}
                    src={img.cloudfront_url}
                    alt={img.filename}
                    className="w-20 h-20 object-cover rounded border"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Form schema preview */}
          {project.form_schema && project.form_schema.fields.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500">Form Schema</h2>
              <ul className="mt-1 text-sm space-y-2">
                {project.form_schema.fields.map((field) => (
                  <li key={field.id} className="border rounded p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded font-mono">
                        {field.field_type}
                      </span>
                      <span>{field.question}</span>
                      {field.required && (
                        <span className="text-xs text-red-500" aria-label="Required field">*</span>
                      )}
                    </div>
                    {field.options.length > 0 && (
                      <ul className="mt-1 ml-4 text-xs text-gray-500 list-disc">
                        {field.options.map((opt, idx) => (
                          <li key={idx}>{opt}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Metadata */}
          <div>
            <h2 className="text-sm font-medium text-gray-500">Metadata</h2>
            <p className="mt-1 text-xs text-gray-400">
              Created: {project.created_at} | Updated: {project.updated_at}
            </p>
          </div>
        </div>
      </div>

      {/* Back link */}
      <button
        type="button"
        onClick={() => navigate('/app/projects-registry/projects')}
        className="text-sm text-blue-600 hover:underline"
      >
        ← Back to Projects
      </button>

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <ConfirmDialog
          title="Delete Project"
          message={`Are you sure you want to delete "${project.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}
    </div>
  );
}
