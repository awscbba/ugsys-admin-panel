import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  subscriptionStore,
  loadSubscriptions,
  approveSubscription,
  rejectSubscription,
  cancelSubscription,
} from '@presentation/stores/subscriptionStore';
import { showToast } from '@presentation/stores/toastStore';
import { getAvailableActions } from '@domain/entities/Subscription';
import { ConfirmDialog } from './ConfirmDialog';
import type { ProjectsRepository } from '@domain/repositories/ProjectsRepository';
import type { SubscriptionStatus } from '@domain/entities/Subscription';

interface SubscriptionManagerProps {
  client: ProjectsRepository;
  navigate: (path: string) => void;
  projectId: string;
}

const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export function SubscriptionManager({ client, navigate, projectId }: SubscriptionManagerProps) {
  const state = useStore(subscriptionStore);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    loadSubscriptions(client, projectId);
  }, [client, projectId, state.page, state.pageSize]);

  const handleApprove = async (subscriptionId: string) => {
    try {
      await approveSubscription(client, projectId, subscriptionId);
      showToast('Subscription approved', 'success');
      await loadSubscriptions(client, projectId);
    } catch {
      // error already set in store by the action
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      await rejectSubscription(client, projectId, rejectTarget, rejectReason || undefined);
      showToast('Subscription rejected', 'success');
      setRejectTarget(null);
      setRejectReason('');
      await loadSubscriptions(client, projectId);
    } catch {
      // error already set in store by the action
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelSubscription(client, projectId, cancelTarget);
      showToast('Subscription cancelled', 'success');
      setCancelTarget(null);
      await loadSubscriptions(client, projectId);
    } catch {
      // error already set in store by the action
    }
  };

  const setPage = (page: number) => {
    subscriptionStore.set({ ...subscriptionStore.get(), page });
  };

  const setPageSize = (pageSize: number) => {
    subscriptionStore.set({ ...subscriptionStore.get(), page: 1, pageSize });
  };

  const totalPages = Math.ceil(state.total / state.pageSize);

  if (state.loading && state.items.length === 0) {
    return (
      <div aria-live="polite" aria-busy="true" className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Subscriptions</h1>
          <button
            type="button"
            onClick={() => navigate(`/app/projects-registry/projects/${projectId}`)}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Project
          </button>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (state.error && state.items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Subscriptions</h1>
          <button
            type="button"
            onClick={() => navigate(`/app/projects-registry/projects/${projectId}`)}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Project
          </button>
        </div>
        <div role="alert" className="text-center py-12">
          <p className="text-red-600 mb-4">{state.error}</p>
          <button
            type="button"
            onClick={() => loadSubscriptions(client, projectId)}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Subscriptions</h1>
        <button
          type="button"
          onClick={() => navigate(`/app/projects-registry/projects/${projectId}`)}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Project
        </button>
      </div>

      {state.error && (
        <div role="alert" className="p-3 bg-red-50 text-red-700 text-sm rounded-md">
          {state.error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 px-3">Person ID</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Notes</th>
              <th className="py-2 px-3">Created</th>
              <th className="py-2 px-3">Updated</th>
              <th className="py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {state.items.map((sub) => {
              const actions = getAvailableActions(sub.status);
              const isActionLoading = state.actionLoading === sub.id;
              return (
                <tr key={sub.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3 font-mono text-xs">{sub.person_id}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[sub.status]}`}
                      aria-label={`Status: ${sub.status}`}
                    >
                      {sub.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-500">{sub.notes ?? '—'}</td>
                  <td className="py-2 px-3 text-xs text-gray-500">{sub.created_at}</td>
                  <td className="py-2 px-3 text-xs text-gray-500">{sub.updated_at}</td>
                  <td className="py-2 px-3">
                    <div className="flex gap-1">
                      {actions.includes('approve') && (
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => handleApprove(sub.id)}
                          className="px-2 py-1 text-xs rounded border text-green-700 hover:bg-green-50 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {actions.includes('reject') && (
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => setRejectTarget(sub.id)}
                          className="px-2 py-1 text-xs rounded border text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      )}
                      {actions.includes('cancel') && (
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => setCancelTarget(sub.id)}
                          className="px-2 py-1 text-xs rounded border text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                      {actions.length === 0 && (
                        <span className="text-xs text-gray-400">No actions</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {state.items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">
                  No subscriptions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <nav aria-label="Subscription pagination" className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <span className="text-gray-500">
            Page {state.page} of {totalPages || 1} ({state.total} total)
          </span>
          <label htmlFor="sub-page-size" className="text-gray-500">
            Rows:
          </label>
          <select
            id="sub-page-size"
            value={state.pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={state.page <= 1}
            onClick={() => setPage(state.page - 1)}
            className="px-3 py-1 border rounded disabled:opacity-40"
            aria-label="Previous page"
          >
            ←
          </button>
          <button
            type="button"
            disabled={state.page >= totalPages}
            onClick={() => setPage(state.page + 1)}
            className="px-3 py-1 border rounded disabled:opacity-40"
            aria-label="Next page"
          >
            →
          </button>
        </div>
      </nav>

      {/* Reject dialog */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-dialog-title"
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
          >
            <h2 id="reject-dialog-title" className="text-lg font-semibold mb-2">
              Reject Subscription
            </h2>
            <label htmlFor="reject-reason" className="block text-sm text-gray-600 mb-2">
              Reason (optional):
            </label>
            <textarea
              id="reject-reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm mb-4"
              placeholder="Enter reason..."
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={state.actionLoading === rejectTarget}
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={state.actionLoading === rejectTarget}
                className="px-4 py-2 text-sm rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {state.actionLoading === rejectTarget ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirmation dialog */}
      {cancelTarget && (
        <ConfirmDialog
          title="Cancel Subscription"
          message="Are you sure you want to cancel this subscription?"
          confirmLabel="Cancel Subscription"
          loading={state.actionLoading === cancelTarget}
          onConfirm={handleCancel}
          onCancel={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}
