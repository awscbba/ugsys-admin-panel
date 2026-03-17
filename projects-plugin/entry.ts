import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { createElement } from 'react';
import { App } from './src/presentation/App';
import { resetAllStores } from './src/presentation/stores';
import type { MicroFrontendContext } from './src/domain/entities/Context';

let root: Root | null = null;

export function mount(container: HTMLElement, context: MicroFrontendContext): void {
  root = createRoot(container);
  root.render(createElement(App, { context }));
}

export function unmount(_container: HTMLElement): void {
  root?.unmount();
  root = null;
  resetAllStores();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__mfe_projects_registry = { mount, unmount };
