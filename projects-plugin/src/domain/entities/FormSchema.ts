export type FieldType = 'text' | 'textarea' | 'poll_single' | 'poll_multiple' | 'date' | 'number';

export interface CustomField {
  id: string;
  field_type: FieldType;
  question: string;
  required: boolean;
  options: string[];
}

export interface FormSchema {
  fields: CustomField[];
}

export function generateFieldId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function shouldShowOptionsEditor(fieldType: FieldType): boolean {
  return fieldType === 'poll_single' || fieldType === 'poll_multiple';
}
