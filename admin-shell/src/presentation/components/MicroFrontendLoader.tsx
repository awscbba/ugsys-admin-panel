/**
 * MicroFrontendLoader — dynamically loads and mounts micro-frontend bundles.
 *
 * Requirements:
 *   6.1 — Dynamically import the Micro_Frontend JS bundle from the URL declared
 *         in the Plugin_Manifest `entryPoint`.
 *   6.2 — Mount each Micro_Frontend into an isolated container element, passing
 *         a shared context object (user ID, roles, display name, auth token
 *         accessor, navigation API).
 *   6.3 — Display a loading skeleton while the bundle is loading.
 *   6.4 — Display an error message identifying the failed service and provide a
 *         retry button on load failure (network error, 404, JS parse error).
 *   6.5 — Unmount and clean up the previous Micro_Frontend before mounting a
 *         new one during route transitions.
 *   6.7 — Handle navigation API calls within the SPA router (no full page reload).
 *
 * The loaded module is expected to export:
 *   mount(container: HTMLElement, context: MicroFrontendContext): void
 *   unmount?(container: HTMLElement): void  (optional)
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import { getComponentLogger } from "../../utils/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Shared context passed to every mounted micro-frontend. */
export interface MicroFrontendContext {
  userId: string;
  roles: string[];
  displayName: string;
  /** Returns the current access token, or null if the session has expired. */
  getAccessToken: () => string | null;
  /** Navigate within the SPA router — no full page reload. */
  navigate: (path: string) => void;
}

/** Shape of a loaded micro-frontend module. */
interface MicroFrontendModule {
  mount: (container: HTMLElement, context: MicroFrontendContext) => void;
  unmount?: (container: HTMLElement) => void;
}

export interface MicroFrontendLoaderProps {
  /** URL of the JS bundle declared in the Plugin Manifest `entryPoint`. */
  entryPoint: string;
  /** Human-readable service name used in error messages and logs. */
  serviceName: string;
  /** Shared context forwarded to the micro-frontend's `mount()` function. */
  context: Omit<MicroFrontendContext, "navigate">;
}

type LoadState = "idle" | "loading" | "mounted" | "error";

// ── Logger ────────────────────────────────────────────────────────────────────

const logger = getComponentLogger("MicroFrontendLoader");

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Loads a micro-frontend bundle via a <script> tag and resolves with the
 * module exported on `window.__mfe_<sanitizedName>`, or rejects on any
 * network / parse error.
 *
 * We use a script-tag approach (rather than `import()`) because `entryPoint`
 * is an external URL that may not be served with CORS headers required for
 * dynamic `import()`.  The bundle is expected to assign itself to a well-known
 * global so we can retrieve the module after the script executes.
 */
function loadBundleViaScriptTag(
  entryPoint: string,
  globalKey: string,
): Promise<MicroFrontendModule> {
  return new Promise((resolve, reject) => {
    // If the bundle was already loaded (e.g. hot-reload scenario), reuse it.
    const existing = (window as unknown as Record<string, unknown>)[
      globalKey
    ] as MicroFrontendModule | undefined;
    if (existing?.mount) {
      resolve(existing);
      return;
    }

    const script = document.createElement("script");
    script.src = entryPoint;
    script.type = "text/javascript";
    script.async = true;
    script.dataset["mfeKey"] = globalKey;

    script.onload = () => {
      const mod = (window as unknown as Record<string, unknown>)[globalKey] as
        | MicroFrontendModule
        | undefined;

      if (!mod?.mount) {
        reject(
          new Error(
            `Bundle loaded but window.${globalKey}.mount is not a function. ` +
              `Ensure the bundle assigns itself to window.${globalKey}.`,
          ),
        );
        return;
      }

      resolve(mod);
    };

    script.onerror = () => {
      reject(
        new Error(
          `Failed to load bundle from "${entryPoint}" (network error or 404).`,
        ),
      );
    };

    document.head.appendChild(script);
  });
}

/** Derives a stable global key from the service name (alphanumeric + underscores). */
function toGlobalKey(serviceName: string): string {
  return `__mfe_${serviceName.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

/** Removes the <script> tag injected for a given global key. */
function removeScriptTag(globalKey: string): void {
  const script = document.head.querySelector<HTMLScriptElement>(
    `script[data-mfe-key="${globalKey}"]`,
  );
  script?.remove();
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

/** Inline loading skeleton shown while the bundle is fetching. */
export function LoadingSkeleton(): React.ReactElement {
  return (
    <div
      aria-busy="true"
      aria-label="Loading micro-frontend"
      role="status"
      style={{
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      {[80, 60, 90, 50].map((width) => (
        <div
          key={width}
          style={{
            height: "1rem",
            width: `${width}%`,
            borderRadius: "0.25rem",
            backgroundColor: "#e5e7eb",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// ── Error UI ──────────────────────────────────────────────────────────────────

interface LoadErrorProps {
  serviceName: string;
  message: string;
  onRetry: () => void;
}

function LoadError({
  serviceName,
  message,
  onRetry,
}: LoadErrorProps): React.ReactElement {
  return (
    <div
      role="alert"
      style={{
        padding: "1.5rem",
        border: "1px solid #f87171",
        borderRadius: "0.5rem",
        backgroundColor: "#fef2f2",
        color: "#991b1b",
        fontFamily: "sans-serif",
      }}
    >
      <h2
        style={{ margin: "0 0 0.5rem", fontSize: "1.125rem", fontWeight: 600 }}
      >
        Failed to load "{serviceName}"
      </h2>
      <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "#7f1d1d" }}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: "0.5rem 1rem",
          backgroundColor: "#dc2626",
          color: "#fff",
          border: "none",
          borderRadius: "0.375rem",
          cursor: "pointer",
          fontSize: "0.875rem",
          fontWeight: 500,
        }}
      >
        Retry
      </button>
    </div>
  );
}

// ── MicroFrontendLoader ───────────────────────────────────────────────────────

/**
 * Loads, mounts, and cleans up a micro-frontend bundle.
 *
 * Lifecycle:
 *   1. On mount (or when `entryPoint` changes): inject <script>, await load.
 *   2. On bundle ready: call `module.mount(container, context)`.
 *   3. On unmount or `entryPoint` change: call `module.unmount(container)`,
 *      remove the <script> tag, and clear the container's DOM.
 */
function MicroFrontendLoaderInner({
  entryPoint,
  serviceName,
  context,
}: MicroFrontendLoaderProps): React.ReactElement {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const moduleRef = useRef<MicroFrontendModule | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [retryKey, setRetryKey] = useState(0);

  const globalKey = toGlobalKey(serviceName);

  // Build the full context including the SPA navigate function (Req 6.7)
  const fullContext: MicroFrontendContext = {
    ...context,
    navigate: (path: string) => {
      logger.logUserAction({
        action: "mfe-navigate",
        target: path,
        serviceName,
      });
      navigate(path);
    },
  };

  const cleanup = useCallback(() => {
    const container = containerRef.current;
    const mod = moduleRef.current;

    if (container && mod) {
      try {
        mod.unmount?.(container);
      } catch (err) {
        logger.warn("Error during micro-frontend unmount", {
          serviceName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (container) {
      container.innerHTML = "";
    }

    removeScriptTag(globalKey);
    moduleRef.current = null;
  }, [globalKey, serviceName]);

  useEffect(() => {
    let cancelled = false;

    setLoadState("loading");
    setErrorMessage("");

    logger.logComponentEvent({
      event: "mfe-load-start",
      component: "MicroFrontendLoader",
      serviceName,
      entryPoint,
    });

    loadBundleViaScriptTag(entryPoint, globalKey)
      .then((mod) => {
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) return;

        moduleRef.current = mod;

        try {
          mod.mount(container, fullContext);
          setLoadState("mounted");

          logger.logComponentEvent({
            event: "mfe-mounted",
            component: "MicroFrontendLoader",
            serviceName,
          });
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : "Unknown error during micro-frontend mount.";
          logger.error("Micro-frontend mount() threw an error", {
            serviceName,
            error: msg,
          });
          setErrorMessage(msg);
          setLoadState("error");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        const msg =
          err instanceof Error
            ? err.message
            : "Unknown error loading micro-frontend bundle.";

        logger.error("Micro-frontend bundle failed to load", {
          serviceName,
          entryPoint,
          error: msg,
        });
        setErrorMessage(msg);
        setLoadState("error");
      });

    return () => {
      cancelled = true;
      cleanup();
    };
    // retryKey is intentionally included to re-trigger on retry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPoint, globalKey, serviceName, retryKey]);

  const handleRetry = useCallback(() => {
    logger.info("User triggered micro-frontend retry", {
      serviceName,
      entryPoint,
    });
    // Remove the stale script tag so the bundle is re-fetched
    removeScriptTag(globalKey);
    delete (window as unknown as Record<string, unknown>)[globalKey];
    setRetryKey((k) => k + 1);
  }, [entryPoint, globalKey, serviceName]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {loadState === "loading" && <LoadingSkeleton />}

      {loadState === "error" && (
        <LoadError
          serviceName={serviceName}
          message={errorMessage}
          onRetry={handleRetry}
        />
      )}

      {/* Isolated container — always rendered so the ref is stable */}
      <div
        ref={containerRef}
        data-mfe={serviceName}
        style={{
          display: loadState === "mounted" ? "block" : "none",
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}

// ── Public export (wrapped in per-MFE ErrorBoundary) ─────────────────────────

/**
 * Public component. Wraps the loader in a per-micro-frontend `ErrorBoundary`
 * so a rendering crash inside the mounted bundle doesn't propagate to the shell.
 */
export function MicroFrontendLoader(
  props: MicroFrontendLoaderProps,
): React.ReactElement {
  return (
    <ErrorBoundary name={props.serviceName}>
      <MicroFrontendLoaderInner {...props} />
    </ErrorBoundary>
  );
}

export default MicroFrontendLoader;
