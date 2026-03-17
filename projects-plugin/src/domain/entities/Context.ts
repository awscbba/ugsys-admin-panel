export interface MicroFrontendContext {
  userId: string;
  roles: string[];
  displayName: string;
  getAccessToken: () => string | null;
  navigate: (path: string) => void;
}
