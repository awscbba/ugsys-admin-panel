import { projectListStore, INITIAL_PROJECT_LIST_STATE } from './projectListStore';
import { projectDetailStore, INITIAL_PROJECT_DETAIL_STATE } from './projectDetailStore';
import { subscriptionStore, INITIAL_SUBSCRIPTION_STATE } from './subscriptionStore';
import { formSchemaStore, INITIAL_FORM_SCHEMA_STATE } from './formSchemaStore';
import { dashboardStore, INITIAL_DASHBOARD_STATE } from './dashboardStore';
import { toastStore, INITIAL_TOAST_STATE } from './toastStore';

export function resetAllStores(): void {
  projectListStore.set(INITIAL_PROJECT_LIST_STATE);
  projectDetailStore.set(INITIAL_PROJECT_DETAIL_STATE);
  subscriptionStore.set(INITIAL_SUBSCRIPTION_STATE);
  formSchemaStore.set(INITIAL_FORM_SCHEMA_STATE);
  dashboardStore.set(INITIAL_DASHBOARD_STATE);
  toastStore.set(INITIAL_TOAST_STATE);
}

export { projectListStore } from './projectListStore';
export { projectDetailStore } from './projectDetailStore';
export { subscriptionStore } from './subscriptionStore';
export { formSchemaStore } from './formSchemaStore';
export { dashboardStore } from './dashboardStore';
export { toastStore } from './toastStore';
