import { atom } from 'nanostores';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

export interface ToastState {
  toasts: Toast[];
}

export const INITIAL_TOAST_STATE: ToastState = {
  toasts: [],
};

export const toastStore = atom<ToastState>({ ...INITIAL_TOAST_STATE });

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 5000;

export function showToast(message: string, type: 'success' | 'error'): void {
  const id = crypto.randomUUID();
  const state = toastStore.get();

  // Keep max 3 visible — drop oldest if at limit
  let toasts = [...state.toasts, { id, message, type }];
  if (toasts.length > MAX_VISIBLE) {
    toasts = toasts.slice(toasts.length - MAX_VISIBLE);
  }

  toastStore.set({ toasts });

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    dismissToast(id);
  }, AUTO_DISMISS_MS);
}

export function dismissToast(id: string): void {
  const state = toastStore.get();
  toastStore.set({
    toasts: state.toasts.filter((t) => t.id !== id),
  });
}
