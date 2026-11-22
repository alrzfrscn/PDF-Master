// Network-first: fresh when online, cached shell when offline.
const CACHE = "pdf-master-v2";
const SHELL = new URL("index.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, key) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key || request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(key || request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Navigations are keyed by the shell, never by the requested query string, and
  // are always fetched first: a new build must never be answered with an
  // index.html that points at asset hashes it no longer ships.
  if (request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(networkFirst(request, SHELL));
    return;
  }
  event.respondWith(networkFirst(request));
});
