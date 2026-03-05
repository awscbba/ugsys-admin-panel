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
 * Requirements: 1.4
 */
export function Sidebar({ navigationEntries, userRoles }: SidebarProps) {
  const location = useLocation();

  // Filter entries where the user has at least one required role
  const visible = navigationEntries.filter((entry) =>
    entry.requiredRoles.some((role) => userRoles.includes(role)),
  );

  // Group by entry.group (default: 'General')
  const groups = new Map<string, NavigationEntry[]>();
  for (const entry of visible) {
    const group = entry.group ?? "General";
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(entry);
  }

  // Sort entries within each group by order (ascending)
  for (const entries of groups.values()) {
    entries.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  return (
    <nav
      aria-label="Sidebar navigation"
      style={{
        width: "240px",
        minHeight: "100%",
        background: "#1e1e2e",
        color: "#cdd6f4",
        display: "flex",
        flexDirection: "column",
        padding: "16px 0",
        flexShrink: 0,
      }}
    >
      {Array.from(groups.entries()).map(([group, entries]) => (
        <div key={group} style={{ marginBottom: "16px" }}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#6c7086",
              padding: "0 16px",
              margin: "0 0 6px",
            }}
          >
            {group}
          </p>

          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {entries.map((entry) => {
              const isActive = location.pathname === entry.path;
              return (
                <li key={entry.path}>
                  <Link
                    to={entry.path}
                    aria-current={isActive ? "page" : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px 16px",
                      fontSize: "14px",
                      textDecoration: "none",
                      color: isActive ? "#cba6f7" : "#cdd6f4",
                      background: isActive
                        ? "rgba(203,166,247,0.12)"
                        : "transparent",
                      borderLeft: isActive
                        ? "3px solid #cba6f7"
                        : "3px solid transparent",
                    }}
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
