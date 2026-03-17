export type SubscriptionStatus = 'pending' | 'active' | 'rejected' | 'cancelled';

export type SubscriptionAction = 'approve' | 'reject' | 'cancel';

export interface Subscription {
  id: string;
  project_id: string;
  person_id: string;
  status: SubscriptionStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export function getAvailableActions(status: SubscriptionStatus): SubscriptionAction[] {
  switch (status) {
    case 'pending':
      return ['approve', 'reject', 'cancel'];
    case 'active':
      return ['cancel'];
    case 'rejected':
    case 'cancelled':
      return [];
  }
}
