import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import {
  projectDetailStore,
  loadProject,
  clearProject,
} from '@presentation/stores/projectDetailStore';
import { showToast } from '@presentation/stores/toastStore';
import { validateProjectForm } from '@domain/validation';
import { computeModifiedFields } from '@domain/diffUtils';
import type { ProjectsRepository } from '@domain/repositories/ProjectsRepository';
import type { ProjectStatus, CreateProjectData } from '@domain/entities/Project';

interface ProjectFormProps {
  client: ProjectsRepository;
  navigate: (path: string) => void;
  projectId?: string;
}

interface FormState {
  name: string;
  description: string;
  rich_text: string;
  category: string;
  start_date: string;
  end_date: string;
  max_participants: string;
  notification_emails: string[];
  image_url: string;
  cloudfront_url: string;
  status: ProjectStatus;
  is_enabled: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  rich_text: '',
  category: '',
  start_date: '',
  end_date: '',
  max_participants: '',
  notification_emails: [],
  image_url: '',
  cloudfront_url: '',
  status: 'pending',
  is_enabled: true,
};

export function ProjectForm({ client, navigate, projectId }: ProjectFormProps) {
  const isEdit = !!projectId;
  const detailState = useStore(projectDetailStore);

  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [formPopulated, setFormPopulated] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');

  // Load project data in edit mode
  useEffect(() => {
    if (isEdit && projectId) {
      loadProject(client, projectId);
    }
    return () => {
      clearProject();
    };
  }, [isEdit, projectId, client]);

  // Populate form when project data arrives
  useEffect(() => {
    if (isEdit && detailState.project && !formPopulated) {
      const p = detailState.project;
      setForm({
        name: p.name,
        description: p.description,
        rich_text: p.rich_text ?? '',
        category: p.category,
        start_date: p.start_date,
        end_date: p.end_date,
        max_participants: String(p.max_participants),
        notification_emails: [...p.notification_emails],
        image_url: '',
        cloudfront_url: '',
        status: p.status,
        is_enabled: p.is_enabled,
      });
      setFormPopulated(true);
    }
  }, [isEdit, detailState.project, formPopulated]);

  const handleChange = useCallback(
    (field: keyof FormState, value: string | boolean) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      setSubmitError(null);
    },
    [],
  );

  const addEmail = useCallback(() => {
    const email = emailInput.trim();
    if (email && !form.notification_emails.includes(email)) {
      setForm((prev) => ({
        ...prev,
        notification_emails: [...prev.notification_emails, email],
      }));
      setEmailInput('');
    }
  }, [emailInput, form.notification_emails]);

  const removeEmail = useCallback((email: string) => {
    setForm((prev) => ({
      ...prev,
      notification_emails: prev.notification_emails.filter((e) => e !== email),
    }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const validation = validateProjectForm({
      name: form.name,
      description: form.description,
      category: form.category,
      start_date: form.start_date,
      end_date: form.end_date,
      max_participants: form.max_participants,
    });

    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && projectId && detailState.project) {
        const original = detailState.project;
        const editedData = {
          name: form.name,
          description: form.description,
          rich_text: form.rich_text,
          category: form.category,
          start_date: form.start_date,
          end_date: form.end_date,
          max_participants: Number(form.max_participants),
          notification_emails: form.notification_emails,
          status: form.status,
          is_enabled: form.is_enabled,
        };
        const originalData = {
          name: original.name,
          description: original.description,
          rich_text: original.rich_text,
          category: original.category,
          start_date: original.start_date,
          end_date: original.end_date,
          max_participants: original.max_participants,
          notification_emails: original.notification_emails,
          status: original.status,
          is_enabled: original.is_enabled,
        };
        const modified = computeModifiedFields(originalData, editedData);
        await client.updateProject(projectId, modified);
        showToast('Project updated', 'success');
        navigate(`/app/projects-registry/projects/${projectId}`);
      } else {
        const data: CreateProjectData = {
          name: form.name,
          description: form.description,
          rich_text: form.rich_text || undefined,
          category: form.category,
          start_date: form.start_date,
          end_date: form.end_date,
          max_participants: Number(form.max_participants),
          notification_emails:
            form.notification_emails.length > 0
              ? form.notification_emails
              : undefined,
          image_url: form.image_url || undefined,
          cloudfront_url: form.cloudfront_url || undefined,
        };
        const created = await client.createProject(data);
        showToast('Project created', 'success');
        navigate(`/app/projects-registry/projects/${created.id}`);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to save project';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/app/projects-registry/projects');
  };

  // Loading state for edit mode
  if (isEdit && detailState.loading) {
    return (
      <div aria-live="polite" aria-busy="true" className="space-y-4">
        <h1 className="text-2xl font-semibold">Edit Project</h1>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Error state for edit mode fetch
  if (isEdit && detailState.error) {
    return (
      <div role="alert" className="text-center py-12">
        <p className="text-red-400 mb-4">{detailState.error}</p>
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 text-sm rounded-md border border-gray-600 hover:bg-gray-700"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  // Not found state for edit mode
  if (isEdit && !detailState.loading && !detailState.project) {
    return (
      <div role="alert" className="text-center py-12">
        <p className="text-gray-400 mb-4">Project not found</p>
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 text-sm rounded-md border border-gray-600 hover:bg-gray-700"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">
        {isEdit ? 'Edit Project' : 'Create Project'}
      </h1>

      {submitError && (
        <div role="alert" className="p-3 bg-red-950 border border-red-700 rounded-md text-sm text-red-300">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Name */}
        <div>
          <label htmlFor="pf-name" className="block text-sm font-medium mb-1">
            Name *
          </label>
          <input
            id="pf-name"
            type="text"
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
          />
          {errors.name && (
            <p className="text-red-400 text-xs mt-1">{errors.name}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="pf-description" className="block text-sm font-medium mb-1">
            Description *
          </label>
          <textarea
            id="pf-description"
            rows={3}
            value={form.description}
            onChange={(e) => handleChange('description', e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
          />
          {errors.description && (
            <p className="text-red-400 text-xs mt-1">{errors.description}</p>
          )}
        </div>

        {/* Rich Text */}
        <div>
          <label htmlFor="pf-rich-text" className="block text-sm font-medium mb-1">
            Rich Text
          </label>
          <textarea
            id="pf-rich-text"
            rows={4}
            value={form.rich_text}
            onChange={(e) => handleChange('rich_text', e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
          />
        </div>

        {/* Category + Max Participants */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="pf-category" className="block text-sm font-medium mb-1">
              Category *
            </label>
            <input
              id="pf-category"
              type="text"
              value={form.category}
              onChange={(e) => handleChange('category', e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            {errors.category && (
              <p className="text-red-400 text-xs mt-1">{errors.category}</p>
            )}
          </div>
          <div>
            <label htmlFor="pf-max-participants" className="block text-sm font-medium mb-1">
              Max Participants *
            </label>
            <input
              id="pf-max-participants"
              type="number"
              min={1}
              value={form.max_participants}
              onChange={(e) => handleChange('max_participants', e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            {errors.max_participants && (
              <p className="text-red-400 text-xs mt-1">
                {errors.max_participants}
              </p>
            )}
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="pf-start-date" className="block text-sm font-medium mb-1">
              Start Date *
            </label>
            <input
              id="pf-start-date"
              type="date"
              value={form.start_date}
              onChange={(e) => handleChange('start_date', e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            {errors.start_date && (
              <p className="text-red-400 text-xs mt-1">{errors.start_date}</p>
            )}
          </div>
          <div>
            <label htmlFor="pf-end-date" className="block text-sm font-medium mb-1">
              End Date *
            </label>
            <input
              id="pf-end-date"
              type="date"
              value={form.end_date}
              onChange={(e) => handleChange('end_date', e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            {errors.end_date && (
              <p className="text-red-400 text-xs mt-1">{errors.end_date}</p>
            )}
          </div>
        </div>

        {/* Status + Enabled (edit mode only) */}
        {isEdit && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="pf-status" className="block text-sm font-medium mb-1">
                Status
              </label>
              <select
                id="pf-status"
                value={form.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="pf-is-enabled"
                type="checkbox"
                checked={form.is_enabled}
                onChange={(e) => handleChange('is_enabled', e.target.checked)}
                className="rounded"
              />
              <label htmlFor="pf-is-enabled" className="text-sm">
                Enabled
              </label>
            </div>
          </div>
        )}

        {/* Image URL + CloudFront URL */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="pf-image-url" className="block text-sm font-medium mb-1">
              Image URL
            </label>
            <input
              id="pf-image-url"
              type="text"
              value={form.image_url}
              onChange={(e) => handleChange('image_url', e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
          <div>
            <label htmlFor="pf-cloudfront-url" className="block text-sm font-medium mb-1">
              CloudFront URL
            </label>
            <input
              id="pf-cloudfront-url"
              type="text"
              value={form.cloudfront_url}
              onChange={(e) => handleChange('cloudfront_url', e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
        </div>

        {/* Notification Emails */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Notification Emails
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addEmail();
                }
              }}
              placeholder="Add email..."
              aria-label="Add notification email"
              className="flex-1 px-3 py-2 border rounded-md text-sm"
            />
            <button
              type="button"
              onClick={addEmail}
              className="px-3 py-2 text-sm border border-gray-600 rounded-md hover:bg-gray-700"
            >
              Add
            </button>
          </div>
          {form.notification_emails.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {form.notification_emails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 rounded text-xs"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    aria-label={`Remove ${email}`}
                    className="text-gray-400 hover:text-red-400"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting
              ? 'Saving...'
              : isEdit
                ? 'Update Project'
                : 'Create Project'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-sm rounded-md border border-gray-600 hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
