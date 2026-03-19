import { useMemo, useState, useCallback, useEffect } from 'react';
import { matchRoute } from '@presentation/hooks/usePluginRouter';
import { ProjectsApiClient } from '@infrastructure/api/ProjectsApiClient';
import { Dashboard } from '@presentation/components/Dashboard';
import { ProjectList } from '@presentation/components/ProjectList';
import { ProjectForm } from '@presentation/components/ProjectForm';
import { ProjectDetail } from '@presentation/components/ProjectDetail';
import { SubscriptionManager } from '@presentation/components/SubscriptionManager';
import { FormSchemaEditor } from '@presentation/components/FormSchemaEditor';
import { NotFound } from '@presentation/components/NotFound';
import { Toast } from '@presentation/components/Toast';
import type { MicroFrontendContext } from '@domain/entities/Context';

interface AppProps {
  context: MicroFrontendContext;
}

export function App({ context }: AppProps) {
  const client = useMemo(
    () => new ProjectsApiClient(context.getAccessToken),
    [context.getAccessToken],
  );

  // Track pathname reactively so navigation triggers a re-render
  const [pathname, setPathname] = useState(() => window.location.pathname);

  // Listen for shell-driven popstate events (back/forward)
  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Wrap context.navigate so every programmatic navigation also updates our state
  const navigate = useCallback(
    (path: string) => {
      context.navigate(path);
      // React Router's navigate() updates history synchronously, so
      // window.location.pathname is already updated when we read it here.
      setPathname(window.location.pathname);
    },
    [context],
  );

  const route = matchRoute(pathname);

  const renderView = () => {
    switch (route.view) {
      case 'dashboard':
        return <Dashboard client={client} navigate={navigate} />;
      case 'project-list':
        return <ProjectList client={client} navigate={navigate} />;
      case 'project-create':
        return <ProjectForm client={client} navigate={navigate} />;
      case 'project-edit':
        return <ProjectForm client={client} navigate={navigate} projectId={route.params?.id} />;
      case 'project-detail':
        return <ProjectDetail client={client} navigate={navigate} projectId={route.params!.id} />;
      case 'subscription-manager':
        return <SubscriptionManager client={client} navigate={navigate} projectId={route.params!.id} />;
      case 'form-schema-editor':
        return <FormSchemaEditor client={client} navigate={navigate} projectId={route.params!.id} />;
      case 'not-found':
        return <NotFound navigate={navigate} />;
    }
  };

  return (
    <div className="p-4">
      {renderView()}
      <Toast />
    </div>
  );
}
