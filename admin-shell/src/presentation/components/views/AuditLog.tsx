/**
 * AuditLog — built-in view for browsing the immutable audit trail.
 *
 * Requirements: 11.2, 11.5, 11.6
 *
 * - Restricted to auditor, admin, super_admin roles (Req 11.2)
 * - Filterable by: date range, actor user ID, target service, HTTP method (Req 11.5)
 * - Sortable, paginated table (Req 11.6)
 * - Columns: timestamp, actor, action, target service, path, method, status
 * - Fetches audit logs via HttpAuditRepository on mount
 * - Loading and error states with retry
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditLogEntry } from "../../../domain/entities/AuditLogEntry";
import type {
  AuditLogFilters,
  PaginatedAuditLogs,
} from "../../../domain/repositories/AuditRepository";
import { HttpAuditRepository } from "../../../infrastructure/repositories/HttpAuditRepository";
import { useRbac } from "../RbacProvider";
import { getComponentLogger } from "../../../utils/logger";
import {
  AUDIT_LOG_ERRORS,
  normalizeError,
  resolveErrorMessage,
} from "../../../utils/errorHandling";

const logger = getComponentLogger("AuditLog");

const PAGE_SIZE = 25;

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

type SortField =
  | "timestamp"
  | "actorUserId"
  | "targetService"
  | "httpMethod"
  | "responseStatus";
type SortDir = "asc" | "desc";

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

function statusColor(code: number): string {
  if (code >= 500) return "#b91c1c";
  if (code >= 400) return "#a16207";
  if (code >= 300) return "#0369a1";
  return "#15803d";
}

function statusBg(code: number): string {
  if (code >= 500) return "#fef2f2";
  if (code >= 400) return "#fefce8";
  if (code >= 300) return "#eff6ff";
  return "#f0fdf4";
}

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "#0369a1";
    case "POST":
      return "#15803d";
    case "PUT":
      return "#7c3aed";
    case "PATCH":
      return "#a16207";
    case "DELETE":
      return "#b91c1c";
    default:
      return "#374151";
  }
}

function sortEntries(
  items: AuditLogEntry[],
  field: SortField,
  dir: SortDir,
): AuditLogEntry[] {
  return [...items].sort((a, b) => {
    let av: string | number = a[field];
    let bv: string | number = b[field];
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: "12px",
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  borderBottom: "2px solid #e5e7eb",
  background: "#f9fafb",
  whiteSpace: "nowrap",
  cursor: "pointer",
  userSelect: "none",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "middle",
  fontSize: "13px",
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "13px",
  color: "#111827",
  background: "#fff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "#6b7280",
  marginBottom: "4px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const headingStyle: React.CSSProperties = {
  margin: "0 0 20px",
  fontSize: "20px",
  fontWeight: 700,
  color: "#111827",
};

const retryBtnStyle: React.CSSProperties = {
  padding: "8px 20px",
  background: "#6366f1",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

function paginationBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "6px 14px",
    background: disabled ? "#f9fafb" : "#fff",
    color: disabled ? "#9ca3af" : "#374151",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

// ── SortableHeader ────────────────────────────────────────────────────────────

interface SortableHeaderProps {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

function SortableHeader({
  field,
  label,
  sortField,
  sortDir,
  onSort,
}: SortableHeaderProps) {
  const isActive = sortField === field;
  return (
    <th
      scope="col"
      style={{ ...thStyle, color: isActive ? "#4f46e5" : "#6b7280" }}
      onClick={() => onSort(field)}
      aria-sort={
        isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      {label}
      {isActive && (
        <span aria-hidden="true" style={{ marginLeft: "4px" }}>
          {sortDir === "asc" ? "↑" : "↓"}
        </span>
      )}
    </th>
  );
}

// ── AuditRow ──────────────────────────────────────────────────────────────────

interface AuditRowProps {
  entry: AuditLogEntry;
}

function AuditRow({ entry }: AuditRowProps) {
  return (
    <tr>
      <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#6b7280" }}>
        {formatTimestamp(entry.timestamp)}
      </td>

      <td style={tdStyle}>
        <div style={{ fontWeight: 500, color: "#111827" }}>
          {entry.actorDisplayName || entry.actorUserId}
        </div>
        {entry.actorDisplayName && (
          <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
            {entry.actorUserId}
          </div>
        )}
      </td>

      <td style={{ ...tdStyle, maxWidth: "220px" }}>
        <span
          title={entry.action}
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.action}
        </span>
      </td>

      <td style={tdStyle}>
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: "4px",
            background: "#f3f4f6",
            color: "#374151",
            fontSize: "12px",
            fontWeight: 500,
          }}
        >
          {entry.targetService}
        </span>
      </td>

      <td style={{ ...tdStyle, maxWidth: "200px" }}>
        <span
          title={entry.targetPath}
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "monospace",
            fontSize: "12px",
          }}
        >
          {entry.targetPath}
        </span>
      </td>

      <td style={tdStyle}>
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: "4px",
            background: "#f0f9ff",
            color: methodColor(entry.httpMethod),
            fontSize: "11px",
            fontWeight: 700,
            fontFamily: "monospace",
            letterSpacing: "0.03em",
          }}
        >
          {entry.httpMethod}
        </span>
      </td>

      <td style={tdStyle}>
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: "4px",
            background: statusBg(entry.responseStatus),
            color: statusColor(entry.responseStatus),
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          {entry.responseStatus}
        </span>
      </td>
    </tr>
  );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: AuditLogFilters;
  onChange: (filters: AuditLogFilters) => void;
  onApply: () => void;
  onReset: () => void;
  isLoading: boolean;
}

function FilterBar({
  filters,
  onChange,
  onApply,
  onReset,
  isLoading,
}: FilterBarProps) {
  const set = (key: keyof AuditLogFilters, value: string) => {
    onChange({ ...filters, [key]: value || undefined });
  };

  return (
    <div
      style={{
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: "10px",
        padding: "16px",
        marginBottom: "20px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "12px",
          marginBottom: "12px",
        }}
      >
        {/* From date */}
        <div>
          <label htmlFor="audit-from-date" style={labelStyle}>
            From date
          </label>
          <input
            id="audit-from-date"
            type="date"
            value={filters.fromDate ?? ""}
            onChange={(e) => set("fromDate", e.target.value)}
            style={inputStyle}
            aria-label="Filter from date"
          />
        </div>

        {/* To date */}
        <div>
          <label htmlFor="audit-to-date" style={labelStyle}>
            To date
          </label>
          <input
            id="audit-to-date"
            type="date"
            value={filters.toDate ?? ""}
            onChange={(e) => set("toDate", e.target.value)}
            style={inputStyle}
            aria-label="Filter to date"
          />
        </div>

        {/* Actor user ID */}
        <div>
          <label htmlFor="audit-actor" style={labelStyle}>
            Actor user ID
          </label>
          <input
            id="audit-actor"
            type="text"
            placeholder="e.g. usr_abc123"
            value={filters.actorUserId ?? ""}
            onChange={(e) => set("actorUserId", e.target.value)}
            style={inputStyle}
            aria-label="Filter by actor user ID"
          />
        </div>

        {/* Target service */}
        <div>
          <label htmlFor="audit-service" style={labelStyle}>
            Target service
          </label>
          <input
            id="audit-service"
            type="text"
            placeholder="e.g. identity-manager"
            value={filters.targetService ?? ""}
            onChange={(e) => set("targetService", e.target.value)}
            style={inputStyle}
            aria-label="Filter by target service"
          />
        </div>

        {/* HTTP method */}
        <div>
          <label htmlFor="audit-method" style={labelStyle}>
            HTTP method
          </label>
          <select
            id="audit-method"
            value={filters.httpMethod ?? ""}
            onChange={(e) => set("httpMethod", e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
            aria-label="Filter by HTTP method"
          >
            <option value="">All methods</option>
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onReset}
          disabled={isLoading}
          style={{
            padding: "7px 16px",
            background: "#fff",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 500,
            cursor: isLoading ? "not-allowed" : "pointer",
          }}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={isLoading}
          style={{
            padding: "7px 16px",
            background: "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          {isLoading ? "Loading…" : "Apply filters"}
        </button>
      </div>
    </div>
  );
}

// ── AuditLog ──────────────────────────────────────────────────────────────────

const EMPTY_FILTERS: AuditLogFilters = {};

export function AuditLog() {
  const { hasAnyRole } = useRbac();
  const canView = hasAnyRole(["auditor", "admin", "super_admin"]);

  const repo = useRef(new HttpAuditRepository());

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PaginatedAuditLogs | null>(null);

  // Pending (uncommitted) filter state — user edits these before applying
  const [pendingFilters, setPendingFilters] =
    useState<AuditLogFilters>(EMPTY_FILTERS);
  // Applied filters — used for actual API calls
  const [appliedFilters, setAppliedFilters] =
    useState<AuditLogFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  // Client-side sort (applied on top of the fetched page)
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Fetch ───────────────────────────────────────────────────────────────

  const fetchLogs = useCallback(
    async (filters: AuditLogFilters, currentPage: number) => {
      setIsLoading(true);
      setErrorMessage(null);
      logger.logComponentEvent({
        event: "fetch_start",
        component: "AuditLog",
        context: { filters, page: currentPage },
      });

      try {
        const data = await repo.current.queryLogs({
          ...filters,
          page: currentPage,
          pageSize: PAGE_SIZE,
        });
        setResult(data);
        logger.logComponentEvent({
          event: "fetch_success",
          component: "AuditLog",
          context: { total: data.total },
        });
      } catch (err) {
        const state = normalizeError(err);
        const msg = resolveErrorMessage(state, AUDIT_LOG_ERRORS);
        logger.warn("Failed to load audit logs", { error: state });
        setErrorMessage(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Fetch on mount and when applied filters / page change
  useEffect(() => {
    if (!canView) return;
    fetchLogs(appliedFilters, page);
  }, [canView, appliedFilters, page, fetchLogs]);

  // ── Filter actions ──────────────────────────────────────────────────────

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedFilters(pendingFilters);
  };

  const handleResetFilters = () => {
    setPendingFilters(EMPTY_FILTERS);
    setPage(1);
    setAppliedFilters(EMPTY_FILTERS);
  };

  // ── Sort ────────────────────────────────────────────────────────────────

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // ── Pagination ──────────────────────────────────────────────────────────

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / PAGE_SIZE))
    : 1;

  // ── Access denied ───────────────────────────────────────────────────────

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
          You need the <strong>auditor</strong>, <strong>admin</strong>, or{" "}
          <strong>super_admin</strong> role to view the audit log.
        </p>
      </div>
    );
  }

  // ── Loading skeleton ────────────────────────────────────────────────────

  if (isLoading && result === null) {
    return (
      <div aria-busy="true" aria-label="Loading audit log">
        <h2 style={headingStyle}>Audit Log</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{
                height: "44px",
                borderRadius: "6px",
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

  // ── Error state ─────────────────────────────────────────────────────────

  if (errorMessage !== null && result === null) {
    return (
      <div>
        <h2 style={headingStyle}>Audit Log</h2>
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
            onClick={() => fetchLogs(appliedFilters, page)}
            style={retryBtnStyle}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const items = result?.items ?? [];
  const sorted = sortEntries(items, sortField, sortDir);

  // ── Main view ───────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <h2 style={{ ...headingStyle, marginBottom: "16px" }}>
        Audit Log
        {result !== null && (
          <span
            style={{
              marginLeft: "10px",
              fontSize: "13px",
              fontWeight: 400,
              color: "#6b7280",
            }}
          >
            {result.total} entr{result.total !== 1 ? "ies" : "y"}
          </span>
        )}
      </h2>

      {/* Filter bar */}
      <FilterBar
        filters={pendingFilters}
        onChange={setPendingFilters}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        isLoading={isLoading}
      />

      {/* Inline error banner (when result already loaded but refresh failed) */}
      {errorMessage !== null && result !== null && (
        <div
          role="alert"
          style={{
            marginBottom: "16px",
            padding: "10px 16px",
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: "6px",
            fontSize: "14px",
            color: "#b91c1c",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setErrorMessage(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#b91c1c",
              fontSize: "16px",
              lineHeight: 1,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        {/* Loading progress bar */}
        {isLoading && (
          <div
            aria-live="polite"
            aria-label="Refreshing audit log"
            style={{
              height: "3px",
              background:
                "linear-gradient(90deg, #6366f1 0%, #a5b4fc 50%, #6366f1 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.2s linear infinite",
            }}
          />
        )}
        <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "800px",
            }}
            aria-label="Audit log table"
          >
            <thead>
              <tr>
                <SortableHeader
                  field="timestamp"
                  label="Timestamp"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  field="actorUserId"
                  label="Actor"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <th scope="col" style={{ ...thStyle, cursor: "default" }}>
                  Action
                </th>
                <SortableHeader
                  field="targetService"
                  label="Target service"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <th scope="col" style={{ ...thStyle, cursor: "default" }}>
                  Path
                </th>
                <SortableHeader
                  field="httpMethod"
                  label="Method"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  field="responseStatus"
                  label="Status"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: "40px 16px",
                      textAlign: "center",
                      color: "#9ca3af",
                      fontSize: "14px",
                    }}
                  >
                    No audit log entries found for the selected filters.
                  </td>
                </tr>
              ) : (
                sorted.map((entry) => <AuditRow key={entry.id} entry={entry} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderTop: "1px solid #f3f4f6",
              fontSize: "13px",
              color: "#6b7280",
            }}
          >
            <span>
              Page {page} of {totalPages}
              {result && ` · ${result.total} total`}
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                aria-label="Previous page"
                style={paginationBtnStyle(page <= 1 || isLoading)}
              >
                ← Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                aria-label="Next page"
                style={paginationBtnStyle(page >= totalPages || isLoading)}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
