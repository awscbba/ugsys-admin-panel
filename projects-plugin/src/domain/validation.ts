import type { CustomField } from './entities/FormSchema';

export interface ProjectFormData {
  name: string;
  description: string;
  category: string;
  start_date: string;
  end_date: string;
  max_participants: number | string;
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateProjectForm(data: ProjectFormData): ValidationResult {
  const errors: Record<string, string> = {};

  // Required fields
  if (!data.name || !data.name.trim()) errors.name = 'Name is required';
  if (!data.description || !data.description.trim()) errors.description = 'Description is required';
  if (!data.category || !data.category.trim()) errors.category = 'Category is required';
  if (!data.start_date) errors.start_date = 'Start date is required';
  if (!data.end_date) errors.end_date = 'End date is required';

  // max_participants validation
  const maxP = typeof data.max_participants === 'string' ? parseInt(data.max_participants, 10) : data.max_participants;
  if (maxP === undefined || maxP === null || isNaN(maxP)) {
    errors.max_participants = 'Max participants is required';
  } else if (!Number.isInteger(maxP) || maxP <= 0) {
    errors.max_participants = 'Max participants must be a positive integer';
  }

  // Date ordering
  if (data.start_date && data.end_date && data.end_date < data.start_date) {
    errors.end_date = 'End date must be equal to or later than start date';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateFormSchema(fields: CustomField[]): ValidationResult {
  const errors: Record<string, string> = {};

  fields.forEach((field, index) => {
    if (!field.question || !field.question.trim()) {
      errors[`field_${index}_question`] = 'Question is required';
    }
    if ((field.field_type === 'poll_single' || field.field_type === 'poll_multiple') && (!field.options || field.options.length < 2)) {
      errors[`field_${index}_options`] = 'Poll fields must have at least 2 options';
    }
  });

  return { valid: Object.keys(errors).length === 0, errors };
}
