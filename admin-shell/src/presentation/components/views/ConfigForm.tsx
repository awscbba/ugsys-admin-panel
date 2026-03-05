/**
 * ConfigForm — dynamic configuration form view driven by JSON Schema.
 *
 * Requirements: 10.2, 10.3, 10.7
 *
 * - Restricted to super_admin and admin roles (Req 10.7)
 * - Fetches configSchema via HttpRegistryRepository.getConfigSchema(serviceName) on mount (Req 10.2)
 * - Renders a dynamic form based on the JSON Schema (Req 10.2)
 *   Supported field types: string (text input), number (number input),
 *   boolean (checkbox), enum (select), nested object (fieldset)
 * - On submit: POST to /api/v1/proxy/{serviceName}/config via HttpClient (Req 10.3)
 * - Shows validation errors from BFF 422 response (Req 10.5)
 * - Shows success message on successful submission
 */

import { useEffect, useRef, useState } from 'react';
import { HttpRegistryRepository } from '../../../infrastructure/repositories/HttpRegistryRepository';
import { HttpClient } from '../../../infrastructure/http/HttpClient';
import { API_CONFIG } from '../../../config/api';
import { useRbac } from '../RbacProvider';
import { getComponentLogger } from '../../../utils/logger';
import { normalizeError, resolveErrorMessage } from '../../../utils/errorHandling';
import type { ErrorMessageMap } from '../../../utils/errorHandling';

const logger = getComponentLogger('ConfigForm');

// ── Error messages ────────────────────────────────────────────────────────────

const CONFIG_FORM_ERRORS: ErrorMessageMap = {
  default: 'Unable to load configuration schema. Please try again.',
  FORBIDDEN: 'You do not have permission to manage this service configuration.',
  SERVICE_NOT_FOUND: 'The service configuration schema could not be found.',
  GATEWAY_TIMEOUT: 'Request timed out. Please try again.',
  EXTERNAL_SERVICE_ERROR: 'The service is currently unavailable. Please try again later.',
  network: 'Network error. Please check your connection and try again.',
  unknown: 'An unexpected error occurred.',
};

// ── JSON Schema types ─────────────────────────────────────────────────────────

interface JsonSchemaProperty {
  type?: string | string[];
  title?: string;
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  default?: unknown;
}

interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

// ── Validation error from BFF 422 ─────────────────────────────────────────────

interface ValidationError {
  field: string;
  message: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFieldType(schema: JsonSchemaProperty): 'string' | 'number' | 'boolean' | 'enum' | 'object' {
  if (schema.enum !== undefined && schema.enum.length > 0) return 'enum';
  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (t === 'boolean') return 'boolean';
  if (t === 'number' || t === 'integer') return 'number';
  if (t === 'object') return 'object';
  return 'string';
}

function getDefaultValue(schema: JsonSchemaProperty): unknown {
  if (schema.default !== undefined) return schema.default;
  const type = getFieldType(schema);
  if (type === 'boolean') return false;
  if (type === 'number') return '';
  if (type === 'object') return {};
  if (type === 'enum') return schema.enum?.[0] ?? '';
  return '';
}

function buildInitialValues(schema: JsonSchema): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (!schema.properties) return values;
  for (const [key, prop] of Object.entries(schema.properties)) {
    const type = getFieldType(prop);
    if (type === 'object' && prop.properties) {
      values[key] = buildInitialValues(prop as JsonSchema);
    } else {
      values[key] = getDefaultValue(prop);
    }
  }
  return values;
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  if (path.length === 1) {
    return { ...obj, [path[0]]: value };
  }
  const [head, ...rest] = path;
  const nested = (obj[head] as Record<string, unknown>) ?? {};
  return { ...obj, [head]: setNestedValue(nested, rest, value) };
}

function getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '4px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '14px',
  color: '#111827',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
};

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  border: '1px solid #f87171',
};

const fieldErrorStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#b91c1c',
  marginTop: '4px',
};

const descriptionStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
  marginTop: '3px',
};

// ── SchemaField ───────────────────────────────────────────────────────────────

interface SchemaFieldProps {
  fieldKey: string;
  schema: JsonSchemaProperty;
  path: string[];
  values: Record<string, unknown>;
  onChange: (path: string[], value: unknown) => void;
  fieldErrors: Record<string, string>;
  required: boolean;
}

function SchemaField({
  fieldKey,
  schema,
  path,
  values,
  onChange,
  fieldErrors,
  required,
}: SchemaFieldProps) {
  const type = getFieldType(schema);
  const label = schema.title ?? fieldKey;
  const fieldPath = [...path, fieldKey];
  const fieldId = fieldPath.join('.');
  const currentValue = getNestedValue(values, fieldPath.slice(path.length === 0 ? 0 : path.length));
  const errorKey = fieldPath.join('.');
  const errorMsg = fieldErrors[errorKey];
  const hasError = errorMsg !== undefined;

  // For nested objects, recurse
  if (type === 'object' && schema.properties) {
    const nestedValues = (currentValue as Record<string, unknown>) ?? {};
    return (
      <fieldset
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '16px',
          margin: '0 0 16px',
        }}
      >
        <legend
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#374151',
            padding: '0 6px',
          }}
        >
          {label}
          {required && (
            <span aria-hidden="true" style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>
          )}
        </legend>
        {schema.description && (
          <p style={{ ...descriptionStyle, marginTop: 0, marginBottom: '12px' }}>
            {schema.description}
          </p>
        )}
        {Object.entries(schema.properties).map(([nestedKey, nestedSchema]) => (
          <SchemaField
            key={nestedKey}
            fieldKey={nestedKey}
            schema={nestedSchema}
            path={fieldPath}
            values={{ [fieldKey]: nestedValues } as Record<string, unknown>}
            onChange={onChange}
            fieldErrors={fieldErrors}
            required={(schema.required ?? []).includes(nestedKey)}
          />
        ))}
      </fieldset>
    );
  }

  const handleChange = (value: unknown) => {
    onChange(fieldPath, value);
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      {type !== 'boolean' && (
        <label htmlFor={fieldId} style={labelStyle}>
          {label}
          {required && (
            <span aria-hidden="true" style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>
          )}
        </label>
      )}

      {type === 'string' && (
        <input
          id={fieldId}
          type="text"
          value={String(currentValue ?? '')}
          onChange={(e) => handleChange(e.target.value)}
          style={hasError ? inputErrorStyle : inputStyle}
          aria-describedby={schema.description ? `${fieldId}-desc` : undefined}
          aria-invalid={hasError}
          aria-required={required}
          minLength={schema.minLength}
          maxLength={schema.maxLength}
        />
      )}

      {type === 'number' && (
        <input
          id={fieldId}
          type="number"
          value={String(currentValue ?? '')}
          onChange={(e) => {
            const v = e.target.value;
            handleChange(v === '' ? '' : Number(v));
          }}
          style={hasError ? inputErrorStyle : inputStyle}
          aria-describedby={schema.description ? `${fieldId}-desc` : undefined}
          aria-invalid={hasError}
          aria-required={required}
          min={schema.minimum}
          max={schema.maximum}
        />
      )}

      {type === 'boolean' && (
        <label
          htmlFor={fieldId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: '#374151',
            cursor: 'pointer',
          }}
        >
          <input
            id={fieldId}
            type="checkbox"
            checked={Boolean(currentValue)}
            onChange={(e) => handleChange(e.target.checked)}
            aria-describedby={schema.description ? `${fieldId}-desc` : undefined}
            aria-required={required}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          {label}
          {required && (
            <span aria-hidden="true" style={{ color: '#ef4444' }}>*</span>
          )}
        </label>
      )}

      {type === 'enum' && (
        <select
          id={fieldId}
          value={String(currentValue ?? '')}
          onChange={(e) => handleChange(e.target.value)}
          style={hasError ? { ...inputErrorStyle, cursor: 'pointer' } : { ...inputStyle, cursor: 'pointer' }}
          aria-describedby={schema.description ? `${fieldId}-desc` : undefined}
          aria-invalid={hasError}
          aria-required={required}
        >
          {(schema.enum ?? []).map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      )}

      {schema.description && (
        <p id={`${fieldId}-desc`} style={descriptionStyle}>
          {schema.description}
        </p>
      )}

      {hasError && (
        <p role="alert" style={fieldErrorStyle}>
          {errorMsg}
        </p>
      )}
    </div>
  );
}

// ── ConfigForm ────────────────────────────────────────────────────────────────

export interface ConfigFormProps {
  serviceName: string;
}

export function ConfigForm({ serviceName }: ConfigFormProps) {
  const { hasAnyRole } = useRbac();
  const canView = hasAnyRole(['super_admin', 'admin']);

  const repo = useRef(new HttpRegistryRepository());
  const http = useRef(HttpClient.getInstance());

  const [schema, setSchema] = useState<JsonSchema | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ── Load schema on mount ──────────────────────────────────────────────

  const loadSchema = async () => {
    setIsLoadingSchema(true);
    setSchemaError(null);
    setSubmitSuccess(false);
    logger.logComponentEvent({ event: 'load_schema_start', component: 'ConfigForm', context: { serviceName } });

    try {
      const raw = await repo.current.getConfigSchema(serviceName);
      const loaded = raw as JsonSchema;
      setSchema(loaded);
      setValues(buildInitialValues(loaded));
      logger.logComponentEvent({ event: 'load_schema_success', component: 'ConfigForm', context: { serviceName } });
    } catch (err) {
      const state = normalizeError(err);
      const msg = resolveErrorMessage(state, CONFIG_FORM_ERRORS);
      logger.warn('Failed to load config schema', { error: state, serviceName });
      setSchemaError(msg);
    } finally {
      setIsLoadingSchema(false);
    }
  };

  useEffect(() => {
    if (canView) {
      loadSchema();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, serviceName]);

  // ── Field change handler ──────────────────────────────────────────────

  const handleFieldChange = (path: string[], value: unknown) => {
    setValues((prev) => setNestedValue(prev, path, value));
    // Clear field error on change
    const key = path.join('.');
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    setFieldErrors({});
    logger.logUserAction({ action: 'submit_config', context: { serviceName } });

    try {
      const url = API_CONFIG.proxy.config(serviceName);
      await http.current.postJson<unknown>(url, values);
      setSubmitSuccess(true);
      logger.logComponentEvent({ event: 'submit_success', component: 'ConfigForm', context: { serviceName } });
    } catch (err) {
      // Handle 422 validation errors from BFF
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as Record<string, unknown>)['status'] === 422
      ) {
        const apiErr = err as { status: number; error: string; message: string; data?: { errors?: ValidationError[] } };
        const errors: Record<string, string> = {};
        if (apiErr.data?.errors) {
          for (const ve of apiErr.data.errors) {
            errors[ve.field] = ve.message;
          }
        }
        if (Object.keys(errors).length > 0) {
          setFieldErrors(errors);
          setSubmitError('Please fix the validation errors below.');
        } else {
          setSubmitError(apiErr.message || 'Configuration validation failed.');
        }
        logger.warn('Config validation failed', { serviceName, errors });
      } else {
        const state = normalizeError(err);
        const msg = resolveErrorMessage(state, CONFIG_FORM_ERRORS);
        logger.warn('Config submit failed', { error: state, serviceName });
        setSubmitError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Access denied ─────────────────────────────────────────────────────

  if (!canView) {
    return (
      <div
        role="alert"
        aria-live="polite"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 24px',
          color: '#6b7280',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: '40px', marginBottom: '16px' }} aria-hidden="true">🔒</span>
        <p style={{ margin: 0, fontSize: '16px', fontWeight: 500 }}>Access denied</p>
        <p style={{ margin: '8px 0 0', fontSize: '14px' }}>
          You need the <strong>admin</strong> or <strong>super_admin</strong> role to manage
          service configuration.
        </p>
      </div>
    );
  }

  // ── Loading schema ────────────────────────────────────────────────────

  if (isLoadingSchema) {
    return (
      <div aria-busy="true" aria-label="Loading configuration schema">
        <h2 style={headingStyle}>
          Configuration — <span style={{ fontWeight: 400, color: '#6b7280' }}>{serviceName}</span>
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{
                height: '56px',
                borderRadius: '6px',
                background: '#e5e7eb',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
      </div>
    );
  }

  // ── Schema load error ─────────────────────────────────────────────────

  if (schemaError !== null) {
    return (
      <div>
        <h2 style={headingStyle}>
          Configuration — <span style={{ fontWeight: 400, color: '#6b7280' }}>{serviceName}</span>
        </h2>
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            padding: '40px 24px',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '10px',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontSize: '15px', color: '#b91c1c', fontWeight: 500 }}>
            {schemaError}
          </p>
          <button type="button" onClick={loadSchema} style={primaryBtnStyle}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── No schema available ───────────────────────────────────────────────

  if (schema === null || !schema.properties || Object.keys(schema.properties).length === 0) {
    return (
      <div>
        <h2 style={headingStyle}>
          Configuration — <span style={{ fontWeight: 400, color: '#6b7280' }}>{serviceName}</span>
        </h2>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>
          No configuration schema is available for this service.
        </p>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────

  const requiredFields = schema.required ?? [];

  return (
    <div>
      <h2 style={headingStyle}>
        Configuration — <span style={{ fontWeight: 400, color: '#6b7280' }}>{serviceName}</span>
      </h2>

      {schema.description && (
        <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#6b7280' }}>
          {schema.description}
        </p>
      )}

      {/* Success banner */}
      {submitSuccess && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#15803d',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span>✓ Configuration updated successfully.</span>
          <button
            type="button"
            aria-label="Dismiss success message"
            onClick={() => setSubmitSuccess(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#15803d',
              fontSize: '16px',
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Submit error banner */}
      {submitError !== null && (
        <div
          role="alert"
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#b91c1c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span>{submitError}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setSubmitError(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#b91c1c',
              fontSize: '16px',
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        aria-label={`Configuration form for ${serviceName}`}
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          padding: '24px',
        }}
      >
        {Object.entries(schema.properties).map(([key, prop]) => (
          <SchemaField
            key={key}
            fieldKey={key}
            schema={prop}
            path={[]}
            values={values}
            onChange={handleFieldChange}
            fieldErrors={fieldErrors}
            required={requiredFields.includes(key)}
          />
        ))}

        <div
          style={{
            display: 'flex',
            gap: '10px',
            justifyContent: 'flex-end',
            marginTop: '8px',
            paddingTop: '16px',
            borderTop: '1px solid #f3f4f6',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setValues(buildInitialValues(schema));
              setFieldErrors({});
              setSubmitError(null);
              setSubmitSuccess(false);
            }}
            disabled={isSubmitting}
            style={secondaryBtnStyle(isSubmitting)}
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            style={primaryBtnStyle}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? 'Saving…' : 'Save configuration'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Shared style helpers ──────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  margin: '0 0 20px',
  fontSize: '20px',
  fontWeight: 700,
  color: '#111827',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '9px 22px',
  background: '#6366f1',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
};

function secondaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '9px 22px',
    background: '#fff',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}
