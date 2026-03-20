interface NotFoundProps {
  navigate: (path: string) => void;
}

export function NotFound({ navigate }: NotFoundProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h1 className="text-2xl font-semibold text-gray-800 dark:text-[#e2e8f0] mb-2">Page not found</h1>
      <p className="text-gray-500 dark:text-[#94a3b8] mb-6">The page you're looking for doesn't exist.</p>
      <button
        type="button"
        onClick={() => navigate('/app/projects-registry/projects')}
        className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
      >
        Go to Projects
      </button>
    </div>
  );
}
