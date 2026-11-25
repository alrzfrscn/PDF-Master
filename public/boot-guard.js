/**
 * Pre-React boot watchdog. React's ErrorBoundary cannot see module-load errors,
 * CSP blocks or missing browser APIs, so this classic script loads before the
 * bundle, records them, and shows a recovery card when nothing mounted.
 */
(function () {
  "use strict";

  var errors = [];
  var shown = false;
  var resetting = false;
  var root = null;
  var status = null;

  window.__PM_BOOTED__ = false;

  function describe(value) {
    if (value && value.stack) return String(value.stack);
    return String(value || "Unknown error");
  }

  function record(value) {
    if (errors.length < 5) errors.push(describe(value));
  }

  window.addEventListener("error", function (event) {
    if (event.error) record(event.error);
    else if (event.message) record(event.message);
    else if (event.target && event.target.src) record("Failed to load " + event.target.src);
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    record(event.reason);
  });

  function node(tag, style, text) {
    var element = document.createElement(tag);
    element.style.cssText = style;
    if (text) element.textContent = text;
    return element;
  }

  function button(label, primary, onClick) {
    var element = node(
      "button",
      "padding:10px 18px;border:0;border-radius:10px;font-size:14px;cursor:pointer;" +
        (primary ? "background:#0a84ff;color:#fff" : "background:#e8ecf3;color:#14161b"),
      label,
    );
    element.type = "button";
    element.addEventListener("click", onClick);
    return element;
  }

  function deleteDatabase(name) {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve();
      var request = window.indexedDB.deleteDatabase(name);
      request.onsuccess = request.onerror = request.onblocked = function () {
        resolve();
      };
    });
  }

  function reset() {
    if (resetting) return;
    resetting = true;
    status.textContent = "Clearing local data\u2026";
    var jobs = [deleteDatabase("pdf-master"), deleteDatabase("pdf-master-stamps")];
    try {
      localStorage.clear();
    } catch (error) {
      // Storage may be the thing that is broken; keep clearing what we can.
    }
    try {
      sessionStorage.clear();
    } catch (error) {
      // Same.
    }
    if (window.caches) {
      jobs.push(
        caches.keys().then(function (keys) {
          return Promise.all(
            keys.map(function (key) {
              return caches.delete(key);
            }),
          );
        }),
      );
    }
    if (navigator.serviceWorker) {
      jobs.push(
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
          return Promise.all(
            registrations.map(function (registration) {
              return registration.unregister();
            }),
          );
        }),
      );
    }
    // The WebView2 HTTP disk cache is outside page reach; the Windows shell clears it.
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
      jobs.push(window.__TAURI_INTERNALS__.invoke("clear_webview_cache"));
    }
    Promise.all(jobs)
      .catch(function () {
        // A failed cleanup still ends in a reload of the cleaned profile.
      })
      .then(function () {
        window.setTimeout(function () {
          window.location.reload();
        }, 500);
      });
  }

  function show() {
    if (shown || window.__PM_BOOTED__) return;
    root = root || document.getElementById("root");
    if (!root) return;
    shown = true;

    var page = node(
      "div",
      "min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;" +
        "background:#dfe5ef;color:#14161b;font-family:system-ui,sans-serif",
    );
    var card = node(
      "div",
      "width:100%;max-width:560px;padding:28px;box-sizing:border-box;border-radius:16px;" +
        "background:#fff;box-shadow:0 12px 40px rgba(15,23,42,0.12)",
    );

    card.appendChild(node("h1", "margin:0 0 8px;font-size:20px", "PDF Master could not start"));
    card.appendChild(
      node(
        "p",
        "margin:0 0 16px;font-size:14px;line-height:1.5;color:#4a5468",
        "The app did not finish loading. Send the details below to support.",
      ),
    );
    card.appendChild(
      node(
        "pre",
        "margin:0 0 12px;padding:12px;max-height:200px;overflow:auto;border-radius:10px;" +
          "background:#f3f5f9;font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word",
        errors.length ? errors.join("\n\n") : "App module did not mount.",
      ),
    );
    card.appendChild(
      node(
        "p",
        "margin:0 0 18px;font-size:11px;line-height:1.5;color:#6b7488;word-break:break-word",
        navigator.userAgent,
      ),
    );

    var actions = node("div", "display:flex;flex-wrap:wrap;align-items:center;gap:10px");
    actions.appendChild(
      button("Reload (Ctrl+R)", true, function () {
        window.location.reload();
      }),
    );
    actions.appendChild(button("Reset Local Cache & Reload", false, reset));
    card.appendChild(actions);

    status = node("p", "margin:12px 0 0;font-size:12px;color:#6b7488", "");
    card.appendChild(status);

    page.appendChild(card);
    root.textContent = "";
    root.appendChild(page);
    page.id = "pm-boot-guard";
  }

  window.setTimeout(function () {
    if (!window.__PM_BOOTED__) show();
  }, 4000);
})();
