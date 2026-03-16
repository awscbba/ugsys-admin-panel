/**
 * useSectionTitle — derives a human-readable section title from the current route.
 *
 * Route → Title mapping:
 *   /dashboard              → "Dashboard"
 *   /users                  → "Users"
 *   /audit                  → "Audit Log"
 *   /config/:serviceName    → "Config — {serviceName}"
 *   /app/:serviceName/*     → manifest.navigation[0].label or serviceName
 *   (no match)              → ""
 *
 * Requirements: 2.1–2.7
 */

import { useLocation, useParams } from "react-router-dom";
import { useStore } from "@nanostores/react";
import { $services } from "../../stores/registryStore";

export function useSectionTitle(): string {
  const { pathname } = useLocation();
  const params = useParams<{ serviceName?: string }>();
  const services = useStore($services);

  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/users") return "Users";
  if (pathname === "/audit") return "Audit Log";

  if (params.serviceName) {
    if (pathname.startsWith("/config/")) {
      return `Config — ${params.serviceName}`;
    }
    if (pathname.startsWith("/app/")) {
      const entry = services.find((s) => s.serviceName === params.serviceName);
      return entry?.manifest?.navigation?.[0]?.label ?? params.serviceName;
    }
  }

  return "";
}
