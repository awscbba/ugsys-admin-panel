import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { toastStore, type ToastState } from '@presentation/stores/toastStore';
import { Toast } from './Toast';

const INITIAL_STATE: ToastState = { toasts: [] };

beforeEach(() => {
  toastStore.set({ ...INITIAL_STATE });
});

afterEach(() => {
  toastStore.set({ ...INITIAL_STATE });
});

describe('Toast', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = render(<Toast />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a success toast message', () => {
    toastStore.set({
      toasts: [{ id: '1', message: 'Project created', type: 'success' }],
    });
    render(<Toast />);
    expect(screen.getByText('Project created')).toBeInTheDocument();
  });

  it('renders an error toast message', () => {
    toastStore.set({
      toasts: [{ id: '2', message: 'Something went wrong', type: 'error' }],
    });
    render(<Toast />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders multiple toasts', () => {
    toastStore.set({
      toasts: [
        { id: '1', message: 'First', type: 'success' },
        { id: '2', message: 'Second', type: 'error' },
      ],
    });
    render(<Toast />);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('has aria-live polite region for accessibility', () => {
    toastStore.set({
      toasts: [{ id: '1', message: 'Accessible toast', type: 'success' }],
    });
    render(<Toast />);
    const liveRegion = screen.getByRole('status').closest('[aria-live]');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });

  it('dismisses a toast when dismiss button is clicked', () => {
    toastStore.set({
      toasts: [{ id: 'dismiss-me', message: 'Will be dismissed', type: 'success' }],
    });
    render(<Toast />);

    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissBtn);

    expect(screen.queryByText('Will be dismissed')).not.toBeInTheDocument();
  });
});
