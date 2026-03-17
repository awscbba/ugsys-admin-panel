import { atom } from 'nanostores';
import type { CustomField } from '@domain/entities/FormSchema';
import { generateFieldId } from '@domain/entities/FormSchema';
import type { ProjectsApiClient } from '@infrastructure/api/ProjectsApiClient';

export interface FormSchemaState {
  fields: CustomField[];
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export const INITIAL_FORM_SCHEMA_STATE: FormSchemaState = {
  fields: [],
  loading: false,
  saving: false,
  error: null,
};

export const formSchemaStore = atom<FormSchemaState>({ ...INITIAL_FORM_SCHEMA_STATE });

export async function loadFormSchema(
  client: ProjectsApiClient,
  projectId: string,
): Promise<void> {
  formSchemaStore.set({ ...formSchemaStore.get(), loading: true, error: null });

  try {
    const project = await client.getProject(projectId);
    const fields = project.form_schema?.fields ?? [];
    formSchemaStore.set({ ...formSchemaStore.get(), fields, loading: false, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load form schema';
    formSchemaStore.set({ ...formSchemaStore.get(), loading: false, error: message });
  }
}

export async function saveFormSchema(
  client: ProjectsApiClient,
  projectId: string,
): Promise<void> {
  const state = formSchemaStore.get();
  formSchemaStore.set({ ...state, saving: true, error: null });

  try {
    const result = await client.updateFormSchema(projectId, state.fields);
    formSchemaStore.set({
      ...formSchemaStore.get(),
      fields: result.fields,
      saving: false,
      error: null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save form schema';
    formSchemaStore.set({ ...formSchemaStore.get(), saving: false, error: message });
  }
}

export function addField(): void {
  const state = formSchemaStore.get();
  const newField: CustomField = {
    id: generateFieldId(),
    field_type: 'text',
    question: '',
    required: false,
    options: [],
  };
  formSchemaStore.set({ ...state, fields: [...state.fields, newField] });
}

export function removeField(index: number): void {
  const state = formSchemaStore.get();
  formSchemaStore.set({
    ...state,
    fields: state.fields.filter((_, i) => i !== index),
  });
}

export function updateField(index: number, field: CustomField): void {
  const state = formSchemaStore.get();
  const fields = [...state.fields];
  fields[index] = field;
  formSchemaStore.set({ ...state, fields });
}

export function moveField(fromIndex: number, toIndex: number): void {
  const state = formSchemaStore.get();
  if (fromIndex < 0 || fromIndex >= state.fields.length) return;
  if (toIndex < 0 || toIndex >= state.fields.length) return;

  const fields = [...state.fields];
  const [moved] = fields.splice(fromIndex, 1);
  fields.splice(toIndex, 0, moved);
  formSchemaStore.set({ ...state, fields });
}
