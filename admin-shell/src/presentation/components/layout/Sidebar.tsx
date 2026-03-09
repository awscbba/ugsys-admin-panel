import { Link, useLocation } from "react-router-dom";
import type { NavigationEntry } from "../../../domain/entities/ServiceRegistration";

interface SidebarProps {
  navigationEntries: NavigationEntry[];
  userRoles: string[];
}

/**
 * Sidebar — renders NavigationEntry items grouped by service, filtered by user roles,
 * sorted by `order` within each group.
 *
 * Uses Design_Tokens via Tailwind utility classes:
 *   bg-primary  (#161d2b) — sidebar background
 *   text-brand  (#FF9900) — active item text + border accent
 *
 * Requirements: 1.4, 8.2, 8.3
 */
export function Sidebar({ navigationEntries, userRoles }: SidebarProps) {
  const location = useLocation();

  const visible = navigationEntries.filter((entry) =>
    entry.requiredRoles.some((role) => userRoles.includes(role)),
  );

  const groups = new Map<string, NavigationEntry[]>();
  for (const entry of visible) {
    const group = entry.group ?? "General";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(entry);
  }

  for (const entries of groups.values()) {
    entries.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  return (
    <nav
      aria-label="Sidebar navigation"
      className="w-60 min-h-full bg-primary text-gray-200 flex flex-col py-4 shrink-0"
    >
      {Array.from(groups.entries()).map(([group, entries]) => (
        <div key={group} className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 px-4 mb-1.5">
            {group}
          </p>

          <ul className="list-none m-0 p-0">
            {entries.map((entry) => {
              const isActive = location.pathname === entry.path;
              return (
                <li key={entry.path}>
                  <Link
                    to={entry.path}
                    aria-current={isActive ? "page" : undefined}
                    className={[
                      "flex items-center gap-2.5 px-4 py-2 text-sm no-underline transition-colors",
                      "border-l-[3px]",
                      isActive
                        ? "text-brand border-brand bg-white/10"
                        : "text-gray-200 border-transparent hover:bg-white/5 hover:text-white",
                    ].join(" ")}
                  >
                    <span aria-hidden="true">{entry.icon}</span>
                    {entry.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
