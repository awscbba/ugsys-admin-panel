import { Link } from "react-router-dom";

interface BreadcrumbProps {
  currentTitle: string;
}

export function Breadcrumb({ currentTitle }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-2 px-6 py-3 text-sm text-gray-400 border-b border-white/5"
    >
      <Link to="/dashboard" className="hover:text-white transition-colors">
        Dashboard
      </Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page" className="text-white">
        {currentTitle}
      </span>
    </nav>
  );
}
