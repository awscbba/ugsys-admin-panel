import { atom } from 'nanostores';
import type { Project } from '@domain/entities/Project';
import type { ProjectsRepository } from '@domain/repositories/ProjectsRepository';

export interface ProjectDetailState {
  project: Project | null;
  loading: boolean;
  error: string | null;
}

export const INITIAL_PROJECT_DETAIL_STATE: ProjectDetailState = {
  project: null,
  loading: false,
  error: null,
};

export const projectDetailStore = atom<ProjectDetailState>({ ...INITIAL_PROJECT_DETAIL_STATE });

export async function loadProject(client: ProjectsRepository, id: string): Promise<void> {
  projectDetailStore.set({ ...projectDetailStore.get(), loading: true, error: null });

  try {
    const project = await client.getProject(id);
    projectDetailStore.set({ project, loading: false, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load project';
    projectDetailStore.set({ project: null, loading: false, error: message });
  }
}

export async function loadEnhancedProject(client: ProjectsRepository, id: string): Promise<void> {
  projectDetailStore.set({ ...projectDetailStore.get(), loading: true, error: null });

  try {
    const project = await client.getEnhancedProject(id);
    projectDetailStore.set({ project, loading: false, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load project';
    projectDetailStore.set({ project: null, loading: false, error: message });
  }
}

export function clearProject(): void {
  projectDetailStore.set({ ...INITIAL_PROJECT_DETAIL_STATE });
}
