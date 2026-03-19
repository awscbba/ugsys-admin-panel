/**
 * Tests for ProjectsApiClient — focuses on normalizeProject behavior
 * applied by getProject and getEnhancedProject.
 *
 * fetch is mocked globally; we verify that null/undefined optional fields
 * are coerced to safe defaults before returning to callers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Project } from '@domain/entities/Project';
import type { FormSchema } from '@domain/entities/FormSchema';
import { ProjectsApiClient } from './ProjectsApiClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    description: 'A test project',
    rich_text: '',
    category: 'tech',
    status: 'active',
    is_enabled: true,
    max_participants: 10,
    current_participants: 2,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    created_by: 'user-1',
    notification_emails: [],
    images: [],
    form_schema: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeFormSchema(overrides: Partial<FormSchema> = {}): FormSchema {
  return { fields: [], ...overrides };
}

/** Stub fetch to return a successful JSON response with the given body. */
function mockFetchOk(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve(body),
    }),
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let client: ProjectsApiClient;

beforeEach(() => {
  client = new ProjectsApiClient(() => 'test-token');
  // stub crypto.randomUUID used inside request()
  vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  // stub document.cookie (no CSRF needed for GET)
  Object.defineProperty(document, 'cookie', { value: '', configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// getProject — normalizeProject
// ---------------------------------------------------------------------------

describe('getProject — normalizeProject', () => {
  it('returns notification_emails as [] when field is null', async () => {
    const raw = makeProject({ notification_emails: null as unknown as string[] });
    mockFetchOk(raw);

    const result = await client.getProject('proj-1');

    expect(result.notification_emails).toEqual([]);
  });

  it('returns notification_emails as [] when field is undefined', async () => {
    const { notification_emails: _, ...rest } = makeProject();
    mockFetchOk(rest);

    const result = await client.getProject('proj-1');

    expect(result.notification_emails).toEqual([]);
  });

  it('preserves notification_emails when already an array', async () => {
    const raw = makeProject({ notification_emails: ['a@example.com', 'b@example.com'] });
    mockFetchOk(raw);

    const result = await client.getProject('proj-1');

    expect(result.notification_emails).toEqual(['a@example.com', 'b@example.com']);
  });

  it('returns images as [] when field is null', async () => {
    const raw = makeProject({ images: null as unknown as Project['images'] });
    mockFetchOk(raw);

    const result = await client.getProject('proj-1');

    expect(result.images).toEqual([]);
  });

  it('returns images as [] when field is undefined', async () => {
    const { images: _, ...rest } = makeProject();
    mockFetchOk(rest);

    const result = await client.getProject('proj-1');

    expect(result.images).toEqual([]);
  });

  it('returns form_schema as null when field is null', async () => {
    const raw = makeProject({ form_schema: null });
    mockFetchOk(raw);

    const result = await client.getProject('proj-1');

    expect(result.form_schema).toBeNull();
  });

  it('returns form_schema as null when field is undefined', async () => {
    const { form_schema: _, ...rest } = makeProject();
    mockFetchOk(rest);

    const result = await client.getProject('proj-1');

    expect(result.form_schema).toBeNull();
  });

  it('returns form_schema.fields as [] when form_schema exists but fields is null', async () => {
    const raw = makeProject({
      form_schema: { fields: null as unknown as FormSchema['fields'] },
    });
    mockFetchOk(raw);

    const result = await client.getProject('proj-1');

    expect(result.form_schema).not.toBeNull();
    expect(result.form_schema!.fields).toEqual([]);
  });

  it('preserves form_schema.fields when already an array', async () => {
    const field = { id: 'f1', field_type: 'text' as const, question: 'Q?', required: false, options: [] };
    const raw = makeProject({ form_schema: makeFormSchema({ fields: [field] }) });
    mockFetchOk(raw);

    const result = await client.getProject('proj-1');

    expect(result.form_schema!.fields).toHaveLength(1);
    expect(result.form_schema!.fields[0].id).toBe('f1');
  });
});

// ---------------------------------------------------------------------------
// getEnhancedProject — same normalizeProject behavior
// ---------------------------------------------------------------------------

describe('getEnhancedProject — normalizeProject', () => {
  it('returns notification_emails as [] when field is null', async () => {
    const raw = makeProject({ notification_emails: null as unknown as string[] });
    mockFetchOk(raw);

    const result = await client.getEnhancedProject('proj-1');

    expect(result.notification_emails).toEqual([]);
  });

  it('returns images as [] when field is null', async () => {
    const raw = makeProject({ images: null as unknown as Project['images'] });
    mockFetchOk(raw);

    const result = await client.getEnhancedProject('proj-1');

    expect(result.images).toEqual([]);
  });

  it('returns form_schema as null when field is undefined', async () => {
    const { form_schema: _, ...rest } = makeProject();
    mockFetchOk(rest);

    const result = await client.getEnhancedProject('proj-1');

    expect(result.form_schema).toBeNull();
  });

  it('returns form_schema.fields as [] when form_schema exists but fields is null', async () => {
    const raw = makeProject({
      form_schema: { fields: null as unknown as FormSchema['fields'] },
    });
    mockFetchOk(raw);

    const result = await client.getEnhancedProject('proj-1');

    expect(result.form_schema!.fields).toEqual([]);
  });
});
