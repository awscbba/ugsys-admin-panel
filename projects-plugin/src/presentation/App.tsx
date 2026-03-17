import { useMemo } from 'react';
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

  const route = matchRoute(window.location.pathname);

  const renderView = () => {
    switch (route.view) {
      case 'dashboard':
        return <Dashboard client={client} navigate={context.navigate} />;
      case 'project-list':
        return <ProjectList client={client} navigate={context.navigate} />;
      case 'project-create':
        return <ProjectForm client={client} navigate={context.navigate} />;
      case 'project-edit':
        return <ProjectForm client={client} navigate={context.navigate} projectId={route.params?.id} />;
      case 'project-detail':
        return <ProjectDetail client={client} navigate={context.navigate} projectId={route.params!.id} />;
      case 'subscription-manager':
        return <SubscriptionManager client={client} navigate={context.navigate} projectId={route.params!.id} />;
      case 'form-schema-editor':
        return <FormSchemaEditor client={client} navigate={context.navigate} projectId={route.params!.id} />;
      case 'not-found':
        return <NotFound navigate={context.navigate} />;
    }
  };

  return (
    <div className="p-4">
      {renderView()}
      <Toast />
    </div>
  );
}
