import "./polyfills";
import "@fontsource-variable/inter";
import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

declare global {
  interface Window {
    /** Flipped once React owns #root; public/boot-guard.js stops its watchdog on it. */
    __PM_BOOTED__?: boolean;
  }
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
const root = createRoot(container);

/**
 * Tauri serves the bundle from the executable itself, so a service worker is
 * never wanted there. One left behind by an older install serves the previous
 * `index.html` — whose asset hashes the new build no longer ships — which is a
 * blank window until the user reloads.
 */
const isTauri =
  "__TAURI_INTERNALS__" in window ||
  window.location.hostname === "tauri.localhost" ||
  window.location.protocol === "tauri:";

const PURGE_KEY = "pdf-master:service-worker-purged";

function alreadyPurged(): boolean {
  try {
    return sessionStorage.getItem(PURGE_KEY) !== null;
  } catch {
    // No sessionStorage: never risk a reload loop.
    return true;
  }
}

/** Returns true when this load was controlled by the stale worker and must reload once. */
async function purgeServiceWorker(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const controlled = Boolean(navigator.serviceWorker.controller);
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  return controlled && !alreadyPurged();
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // Inline styles on purpose: the stylesheet may be what failed to load.
    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#dfe5ef",
          color: "#14161b",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            padding: 28,
            borderRadius: 16,
            background: "#fff",
            boxShadow: "0 12px 40px rgba(15, 23, 42, 0.12)",
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>PDF Master could not start</h1>
          <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.5, color: "#4a5468" }}>
            {error.message || "An unexpected error occurred while loading the app."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 18px",
              border: 0,
              borderRadius: 10,
              background: "#0a84ff",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

function render(): void {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
  // Any boot diagnostic shown by the watchdog is replaced by the real app now.
  window.__PM_BOOTED__ = true;
  // A watchdog card painted during a slow boot must not sit above the app.
  document.getElementById("pm-boot-guard")?.remove();
}

if (isTauri) {
  void purgeServiceWorker()
    .then((reload) => {
      if (!reload) return render();
      try {
        sessionStorage.setItem(PURGE_KEY, "1");
      } catch {
        // The in-memory load still ends in a clean reload.
      }
      window.location.reload();
    })
    .catch(render);
} else {
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    });
  }
  render();
}
