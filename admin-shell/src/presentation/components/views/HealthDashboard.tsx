/**
 * HealthDashboard — built-in view showing aggregated service health status.
 *
 * Requirements: 8.2, 8.3, 8.7
 *
 * - Restricted to admin and super_admin roles (Req 8.2, 8.7)
 * - Renders service cards with color-coded status indicators (Req 8.7)
 * - Each card shows: service name, status, last check timestamp,
 *   response time ms, version (Req 8.3)
 * - Loads health data on mount via healthStore.loadHealthStatuses()
 * - Shows loading state while fetching
 * - Shows error state with retry button on failure
 */

import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import {
  $healthStatuses,
  loadHealthStatuses,
} from "../../../stores/healthStore";
import type {
  HealthStatus,
  HealthState,
} from "../../../domain/entities/HealthStatus";
import { useRbac } from "../RbacProvider";
import { getComponentLogger } from "../../../utils/logger";
import {
  HEALTH_DASHBOARD_ERRORS,
  normalizeError,
  resolveErrorMessage,
} from "../../../utils/errorHandling";

const logger = getComponentLogger("HealthDashboard");

// ── Status color palette ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<
  HealthState,
  { bg: string; border: string; text: string; dot: string }
> = {
  healthy: {
    bg: "#f0fdf4",
    border: "#86efac",
    text: "#15803d",
    dot: "#22c55e",
  },
  degraded: {
    bg: "#fefce8",
    border: "#fde047",
    text: "#a16207",
    dot: "#eab308",
  },
  unhealthy: {
    bg: "#fef2f2",
    border: "#fca5a5",
    text: "#b91c1c",
    dot: "#ef4444",
  },
  unknown: {
    bg: "#f9fafb",
    border: "#d1d5db",
    text: "#6b7280",
    dot: "#9ca3af",
  },
};

const STATUS_LABELS: Record<HealthState, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  unhealthy: "Unhealthy",
  unknown: "Unknown",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

// ── ServiceCard ───────────────────────────────────────────────────────────────

interface ServiceCardProps {
  entry: HealthStatus;
}

function ServiceCard({ entry }: ServiceCardProps) {
  const colors = STATUS_COLORS[entry.status];

  return (
    <article
      aria-label={`Health status for ${entry.serviceName}`}
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: "10px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {/* Header: service name + status badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "15px",
            fontWeight: 600,
            color: "#111827",
            wordBreak: "break-word",
          }}
        >
          {entry.serviceName}
        </h3>

        <span
          aria-label={`Status: ${STATUS_LABELS[entry.status]}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "3px 10px",
            borderRadius: "9999px",
            fontSize: "12px",
            fontWeight: 600,
            color: colors.text,
            background: "#fff",
            border: `1px solid ${colors.border}`,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {/* Colored dot */}
          <span
            aria-hidden="true"
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: colors.dot,
              display: "inline-block",
            }}
          />
          {STATUS_LABELS[entry.status]}
        </span>
      </div>

      {/* Metadata grid */}
      <dl
        style={{
          margin: 0,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px 16px",
          fontSize: "13px",
        }}
      >
        <div>
          <dt style={{ color: "#6b7280", marginBottom: "2px" }}>Last check</dt>
          <dd style={{ margin: 0, color: "#374151", fontWeight: 500 }}>
            {formatTimestamp(entry.lastCheck)}
          </dd>
        </div>

        <div>
          <dt style={{ color: "#6b7280", marginBottom: "2px" }}>
            Response time
          </dt>
          <dd style={{ margin: 0, color: "#374151", fontWeight: 500 }}>
            {entry.responseTimeMs} ms
          </dd>
        </div>

        <div>
          <dt style={{ color: "#6b7280", marginBottom: "2px" }}>Version</dt>
          <dd style={{ margin: 0, color: "#374151", fontWeight: 500 }}>
            {entry.version || "—"}
          </dd>
        </div>

        {entry.statusCode !== undefined && (
          <div>
            <dt style={{ color: "#6b7280", marginBottom: "2px" }}>
              Status code
            </dt>
            <dd style={{ margin: 0, color: "#374151", fontWeight: 500 }}>
              {entry.statusCode}
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}

// ── HealthDashboard ───────────────────────────────────────────────────────────

export function HealthDashboard() {
  const { hasAnyRole } = useRbac();
  const healthStatuses = useStore($healthStatuses);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canView = hasAnyRole(["admin", "super_admin"]);

  const fetchStatuses = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    logger.logComponentEvent({
      event: "fetch_start",
      component: "HealthDashboard",
    });

    try {
      await loadHealthStatuses();
      logger.logComponentEvent({
        event: "fetch_success",
        component: "HealthDashboard",
      });
    } catch (err) {
      const state = normalizeError(err);
      const msg = resolveErrorMessage(state, HEALTH_DASHBOARD_ERRORS);
      logger.warn("Failed to load health statuses", { error: state });
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canView) {
      fetchStatuses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  // ── Access denied ─────────────────────────────────────────────────────

  if (!canView) {
    return (
      <div
        role="alert"
        aria-live="polite"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px 24px",
          color: "#6b7280",
          textAlign: "center",
        }}
      >
        <span
          style={{ fontSize: "40px", marginBottom: "16px" }}
          aria-hidden="true"
        >
          🔒
        </span>
        <p style={{ margin: 0, fontSize: "16px", fontWeight: 500 }}>
          Access denied
        </p>
        <p style={{ margin: "8px 0 0", fontSize: "14px" }}>
          You need the <strong>admin</strong> or <strong>super_admin</strong>{" "}
          role to view the health dashboard.
        </p>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading health data">
        <h2
          style={{
            margin: "0 0 24px",
            fontSize: "20px",
            fontWeight: 700,
            color: "#111827",
          }}
        >
          Service Health
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "16px",
          }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{
                height: "140px",
                borderRadius: "10px",
                background: "#e5e7eb",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────

  if (errorMessage !== null) {
    return (
      <div>
        <h2
          style={{
            margin: "0 0 24px",
            fontSize: "20px",
            fontWeight: 700,
            color: "#111827",
          }}
        >
          Service Health
        </h2>
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            padding: "40px 24px",
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: "10px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "15px",
              color: "#b91c1c",
              fontWeight: 500,
            }}
          >
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={fetchStatuses}
            style={{
              padding: "8px 20px",
              background: "#6366f1",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Health cards grid ─────────────────────────────────────────────────

  const entries = Object.values(healthStatuses);

  return (
    <div>
      <h2
        style={{
          margin: "0 0 24px",
          fontSize: "20px",
          fontWeight: 700,
          color: "#111827",
        }}
      >
        Service Health
        <span
          style={{
            marginLeft: "10px",
            fontSize: "13px",
            fontWeight: 400,
            color: "#6b7280",
          }}
        >
          {entries.length} service{entries.length !== 1 ? "s" : ""}
        </span>
      </h2>

      {entries.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: "14px" }}>
          No services registered yet.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "16px",
          }}
        >
          {entries.map((entry) => (
            <ServiceCard key={entry.serviceName} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
