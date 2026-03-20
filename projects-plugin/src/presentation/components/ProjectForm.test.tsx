/**
 * Unit tests for ProjectForm — task 11.2
 *
 * Covers:
 * - Create mode: renders empty form, submit calls createProject, cancel navigates back
 * - Edit mode: pre-populates from store, submit calls updateProject with only modified fields
 * - Validation: per-field error messages shown, submit blocked when invalid
 * - Loading / error / not-found states in edit mode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { projectDetailStore, INITIAL_PROJECT_DETAIL_STATE } from '@presentation/stores/projectDetailStore';
import type { ProjectsRepository } from '@domain/repositories/ProjectsRepository';
import type { Project } from '@domain/entities/Project';
import { ProjectForm } from './ProjectForm';

// Mock loadProject so it doesn't override store state set in tests
vi.mock('@presentation/stores/projectDetailStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@presentation/stores/projectDetailStore')>();
  return {
    ...actual,
    loadProject: vi.fn(),
    clearProject: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    description: 'A test description',
    rich_text: '',
    category: 'Engineering',
    status: 'pending',
    is_enabled: true,
    max_participants: 10,
    current_participants: 0,
    start_date: '2026-04-01',
    end_date: '2026-06-30',
    created_by: 'user-1',
    notification_emails: [],
    images: [],
    form_schema: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeClient(overrides: Partial<ProjectsRepository> = {}): ProjectsRepository {
  return {
    listProjects: vi.fn(),
    getProject: vi.fn(),
    getEnhancedProject: vi.fn(),
    createProject: vi.fn().mockResolvedValue(makeProject({ id: 'new-proj' })),
    updateProject: vi.fn().mockResolvedValue(makeProject()),
    deleteProject: vi.fn(),
    listSubscriptions: vi.fn(),
    approveSubscription: vi.fn(),
    rejectSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    getFormSchema: vi.fn(),
    saveFormSchema: vi.fn(),
    getDashboard: vi.fn(),
    ...overrides,
  } as unknown as ProjectsRepository;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  projectDetailStore.set({ ...INITIAL_PROJECT_DETAIL_STATE });
});

afterEach(() => {
  projectDetailStore.set({ ...INITIAL_PROJECT_DETAIL_STATE });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Create mode
// ---------------------------------------------------------------------------

describe('ProjectForm — create mode', () => {
  it('renders empty form with "Create Project" heading', () => {
    render(<ProjectForm client={makeClient()} navigate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /create project/i })).toBeInTheDocument();
  });

  it('renders all required field labels', () => {
    render(<ProjectForm client={makeClient()} navigate={vi.fn()} />);
    expect(screen.getByLabelText(/name \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start date \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end date \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max participants \*/i)).toBeInTheDocument();
  });

  it('does not render status or is_enabled fields in create mode', () => {
    render(<ProjectForm client={makeClient()} navigate={vi.fn()} />);
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/enabled/i)).not.toBeInTheDocument();
  });

  it('shows per-field validation errors when submitting empty form', async () => {
    render(<ProjectForm client={makeClient()} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/description is required/i)).toBeInTheDocument();
      expect(screen.getByText(/category is required/i)).toBeInTheDocument();
    });
  });

  it('error text for name field uses text-red-600 dark:text-red-400 class', async () => {
    render(<ProjectForm client={makeClient()} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => {
      const errorEl = screen.getByText(/name is required/i);
      expect(errorEl).toHaveClass('text-red-600');
    });
  });

  it('clears field error when user types in that field', async () => {
    render(<ProjectForm client={makeClient()} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => expect(screen.getByText(/name is required/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/name \*/i), { target: { value: 'My Project' } });
    expect(screen.queryByText(/name is required/i)).not.toBeInTheDocument();
  });

  it('calls createProject and navigates to detail on successful submit', async () => {
    const navigate = vi.fn();
    const client = makeClient({
      createProject: vi.fn().mockResolvedValue(makeProject({ id: 'new-proj' })),
    });

    render(<ProjectForm client={client} navigate={navigate} />);

    fireEvent.change(screen.getByLabelText(/name \*/i), { target: { value: 'My Project' } });
    fireEvent.change(screen.getByLabelText(/description \*/i), { target: { value: 'Some description' } });
    fireEvent.change(screen.getByLabelText(/category \*/i), { target: { value: 'Tech' } });
    fireEvent.change(screen.getByLabelText(/start date \*/i), { target: { value: '2026-04-01' } });
    fireEvent.change(screen.getByLabelText(/end date \*/i), { target: { value: '2026-06-30' } });
    fireEvent.change(screen.getByLabelText(/max participants \*/i), { target: { value: '20' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    });

    await waitFor(() => {
      expect(client.createProject).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith('/app/projects-registry/projects/new-proj');
    });
  });

  it('shows submit error when createProject rejects', async () => {
    const client = makeClient({
      createProject: vi.fn().mockRejectedValue(new Error('Network error')),
    });

    render(<ProjectForm client={client} navigate={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/name \*/i), { target: { value: 'My Project' } });
    fireEvent.change(screen.getByLabelText(/description \*/i), { target: { value: 'Some description' } });
    fireEvent.change(screen.getByLabelText(/category \*/i), { target: { value: 'Tech' } });
    fireEvent.change(screen.getByLabelText(/start date \*/i), { target: { value: '2026-04-01' } });
    fireEvent.change(screen.getByLabelText(/end date \*/i), { target: { value: '2026-06-30' } });
    fireEvent.change(screen.getByLabelText(/max participants \*/i), { target: { value: '20' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/network error/i);
    });
  });

  it('cancel button navigates to projects list', () => {
    const navigate = vi.fn();
    render(<ProjectForm client={makeClient()} navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(navigate).toHaveBeenCalledWith('/app/projects-registry/projects');
  });

  it('can add and remove notification emails', () => {
    render(<ProjectForm client={makeClient()} navigate={vi.fn()} />);

    const emailInput = screen.getByLabelText(/add notification email/i);
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(screen.getByText('test@example.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /remove test@example\.com/i }));
    expect(screen.queryByText('test@example.com')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Edit mode — loading / error / not-found states
// ---------------------------------------------------------------------------

describe('ProjectForm — edit mode states', () => {
  it('renders loading skeleton while project is loading', () => {
    projectDetailStore.set({ project: null, loading: true, error: null });
    render(<ProjectForm client={makeClient()} navigate={vi.fn()} projectId="proj-1" />);
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('renders error state with back button when fetch fails', () => {
    projectDetailStore.set({ project: null, loading: false, error: 'Failed to load project' });
    render(<ProjectForm client={makeClient()} navigate={vi.fn()} projectId="proj-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/failed to load project/i);
    expect(screen.getByRole('button', { name: /back to projects/i })).toBeInTheDocument();
  });

  it('renders not-found state when project is null and not loading', () => {
    projectDetailStore.set({ project: null, loading: false, error: null });
    render(<ProjectForm client={makeClient()} navigate={vi.fn()} projectId="proj-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/project not found/i);
  });

  it('renders "Edit Project" heading when project is loaded', () => {
    projectDetailStore.set({ project: makeProject(), loading: false, error: null });
    render(<ProjectForm client={makeClient()} navigate={vi.fn()} projectId="proj-1" />);

    expect(screen.getByRole('heading', { name: /edit project/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Edit mode — pre-population and submit
// ---------------------------------------------------------------------------

describe('ProjectForm — edit mode pre-population', () => {
  it('pre-populates form fields from loaded project', () => {
    const project = makeProject({
      name: 'Loaded Project',
      description: 'Loaded description',
      category: 'Design',
      start_date: '2026-05-01',
      end_date: '2026-08-31',
      max_participants: 25,
    });
    projectDetailStore.set({ project, loading: false, error: null });

    render(<ProjectForm client={makeClient()} navigate={vi.fn()} projectId="proj-1" />);

    expect(screen.getByLabelText(/name \*/i)).toHaveValue('Loaded Project');
    expect(screen.getByLabelText(/description \*/i)).toHaveValue('Loaded description');
    expect(screen.getByLabelText(/category \*/i)).toHaveValue('Design');
    expect(screen.getByLabelText(/max participants \*/i)).toHaveValue(25);
  });

  it('renders status dropdown and enabled checkbox in edit mode', () => {
    projectDetailStore.set({ project: makeProject(), loading: false, error: null });
    render(<ProjectForm client={makeClient()} navigate={vi.fn()} projectId="proj-1" />);

    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/enabled/i)).toBeInTheDocument();
  });

  it('calls updateProject on submit in edit mode', async () => {
    const project = makeProject();
    projectDetailStore.set({ project, loading: false, error: null });
    const client = makeClient({ updateProject: vi.fn().mockResolvedValue(project) });
    const navigate = vi.fn();

    render(<ProjectForm client={client} navigate={navigate} projectId="proj-1" />);

    // Change the name to trigger a diff
    fireEvent.change(screen.getByLabelText(/name \*/i), { target: { value: 'Updated Name' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /update project/i }));
    });

    await waitFor(() => {
      expect(client.updateProject).toHaveBeenCalledWith('proj-1', expect.objectContaining({ name: 'Updated Name' }));
      expect(navigate).toHaveBeenCalledWith('/app/projects-registry/projects/proj-1');
    });
  });

  it('sends only modified fields on update (diff)', async () => {
    const project = makeProject({ name: 'Original', description: 'Original desc' });
    projectDetailStore.set({ project, loading: false, error: null });
    const client = makeClient({ updateProject: vi.fn().mockResolvedValue(project) });

    render(<ProjectForm client={client} navigate={vi.fn()} projectId="proj-1" />);

    // Only change name — description stays the same
    fireEvent.change(screen.getByLabelText(/name \*/i), { target: { value: 'Changed Name' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /update project/i }));
    });

    await waitFor(() => {
      const [, payload] = (client.updateProject as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(payload).toHaveProperty('name', 'Changed Name');
      expect(payload).not.toHaveProperty('description');
    });
  });
});
