import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  formSchemaStore,
  loadFormSchema,
  saveFormSchema,
  addField,
  removeField,
  updateField,
  moveField,
} from '@presentation/stores/formSchemaStore';
import { showToast } from '@presentation/stores/toastStore';
import { shouldShowOptionsEditor } from '@domain/entities/FormSchema';
import { validateFormSchema } from '@domain/validation';
import type { ProjectsRepository } from '@domain/repositories/ProjectsRepository';
import type { FieldType } from '@domain/entities/FormSchema';

interface FormSchemaEditorProps {
  client: ProjectsRepository;
  navigate: (path: string) => void;
  projectId: string;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'poll_single', label: 'Poll (Single)' },
  { value: 'poll_multiple', label: 'Poll (Multiple)' },
];

export function FormSchemaEditor({ client, navigate, projectId }: FormSchemaEditorProps) {
  const { fields, loading, saving, error } = useStore(formSchemaStore);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadFormSchema(client, projectId);
  }, [client, projectId]);

  const backPath = `/app/projects-registry/projects/${projectId}`;

  const handleSave = async () => {
    const validation = validateFormSchema(fields);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      showToast('Please fix validation errors before saving', 'error');
      return;
    }
    setValidationErrors({});
    await saveFormSchema(client, projectId);
    const state = formSchemaStore.get();
    if (!state.error) {
      showToast('Form schema saved', 'success');
      navigate(backPath);
    }
  };

  const handleAddOption = (fieldIndex: number) => {
    const field = fields[fieldIndex];
    updateField(fieldIndex, { ...field, options: [...field.options, ''] });
  };

  const handleRemoveOption = (fieldIndex: number, optionIndex: number) => {
    const field = fields[fieldIndex];
    updateField(fieldIndex, {
      ...field,
      options: field.options.filter((_, i) => i !== optionIndex),
    });
  };

  const handleUpdateOption = (fieldIndex: number, optionIndex: number, value: string) => {
    const field = fields[fieldIndex];
    const options = [...field.options];
    options[optionIndex] = value;
    updateField(fieldIndex, { ...field, options });
  };

  const handleFieldTypeChange = (index: number, newType: FieldType) => {
    const field = fields[index];
    updateField(index, {
      ...field,
      field_type: newType,
      options: shouldShowOptionsEditor(newType) ? field.options : [],
    });
    // Clear options validation error when switching away from poll type
    if (!shouldShowOptionsEditor(newType) && validationErrors[`field_${index}_options`]) {
      const next = { ...validationErrors };
      delete next[`field_${index}_options`];
      setValidationErrors(next);
    }
  };

  if (loading) {
    return (
      <div aria-live="polite" aria-busy="true" className="space-y-4">
        <h1 className="text-2xl font-semibold">Form Schema Editor</h1>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error && fields.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Form Schema Editor</h1>
          <button
            type="button"
            onClick={() => navigate(backPath)}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Project
          </button>
        </div>
        <div role="alert" className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => loadFormSchema(client, projectId)}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Form Schema Editor</h1>
        <button
          type="button"
          onClick={() => navigate(backPath)}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Project
        </button>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-red-50 text-red-700 text-sm rounded-md">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {fields.map((field, index) => {
          const questionError = validationErrors[`field_${index}_question`];
          const optionsError = validationErrors[`field_${index}_options`];

          return (
            <fieldset
              key={field.id}
              className="border rounded-lg p-4 space-y-3"
            >
              <legend className="sr-only">Field {index + 1}</legend>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Field {index + 1}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveField(index, index - 1)}
                    className="px-2 py-1 text-xs border rounded disabled:opacity-30"
                    aria-label={`Move field ${index + 1} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === fields.length - 1}
                    onClick={() => moveField(index, index + 1)}
                    className="px-2 py-1 text-xs border rounded disabled:opacity-30"
                    aria-label={`Move field ${index + 1} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeField(index)}
                    className="px-2 py-1 text-xs border rounded text-red-600 hover:bg-red-50"
                    aria-label={`Remove field ${index + 1}`}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`field-type-${field.id}`}
                    className="block text-xs font-medium mb-1"
                  >
                    Type
                  </label>
                  <select
                    id={`field-type-${field.id}`}
                    value={field.field_type}
                    onChange={(e) =>
                      handleFieldTypeChange(index, e.target.value as FieldType)
                    }
                    className="w-full px-2 py-1.5 border rounded text-sm"
                  >
                    {FIELD_TYPES.map((ft) => (
                      <option key={ft.value} value={ft.value}>
                        {ft.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input
                    id={`field-required-${field.id}`}
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) =>
                      updateField(index, { ...field, required: e.target.checked })
                    }
                    className="rounded"
                  />
                  <label
                    htmlFor={`field-required-${field.id}`}
                    className="text-sm"
                  >
                    Required
                  </label>
                </div>
              </div>

              <div>
                <label
                  htmlFor={`field-question-${field.id}`}
                  className="block text-xs font-medium mb-1"
                >
                  Question
                </label>
                <input
                  id={`field-question-${field.id}`}
                  type="text"
                  value={field.question}
                  onChange={(e) =>
                    updateField(index, { ...field, question: e.target.value })
                  }
                  className={`w-full px-2 py-1.5 border rounded text-sm ${questionError ? 'border-red-500' : ''}`}
                  placeholder="Enter question..."
                  aria-invalid={!!questionError}
                  aria-describedby={
                    questionError ? `field-question-error-${field.id}` : undefined
                  }
                />
                {questionError && (
                  <p
                    id={`field-question-error-${field.id}`}
                    className="text-xs text-red-600 mt-1"
                    role="alert"
                  >
                    {questionError}
                  </p>
                )}
              </div>

              {shouldShowOptionsEditor(field.field_type) && (
                <div>
                  <span className="block text-xs font-medium mb-1">
                    Poll Options (min 2)
                  </span>
                  <div className="space-y-2">
                    {field.options.map((option, optIdx) => (
                      <div key={optIdx} className="flex gap-2">
                        <label
                          htmlFor={`field-${field.id}-option-${optIdx}`}
                          className="sr-only"
                        >
                          Option {optIdx + 1} for field {index + 1}
                        </label>
                        <input
                          id={`field-${field.id}-option-${optIdx}`}
                          type="text"
                          value={option}
                          onChange={(e) =>
                            handleUpdateOption(index, optIdx, e.target.value)
                          }
                          className="flex-1 px-2 py-1.5 border rounded text-sm"
                          placeholder={`Option ${optIdx + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(index, optIdx)}
                          className="px-2 py-1 text-xs border rounded text-red-600 hover:bg-red-50"
                          aria-label={`Remove option ${optIdx + 1}`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddOption(index)}
                    className="mt-2 px-3 py-1 text-xs border rounded hover:bg-gray-50"
                  >
                    + Add Option
                  </button>
                  {optionsError && (
                    <p
                      className="text-xs text-red-600 mt-1"
                      role="alert"
                    >
                      {optionsError}
                    </p>
                  )}
                </div>
              )}
            </fieldset>
          );
        })}

        {fields.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            No fields yet. Click "Add Field" to get started.
          </p>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={addField}
          className="px-4 py-2 text-sm rounded-md border hover:bg-gray-50"
        >
          + Add Field
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Schema'}
        </button>
        <button
          type="button"
          onClick={() => navigate(backPath)}
          className="px-4 py-2 text-sm rounded-md border hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
