// Conservative offline shell: caches static assets and the last-seen pages for
// crates/history; API responses are network-first and never cached long term.
const SHELL = "dig-shell-v1";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/crates", "/history", "/manifest.webmanifest", "/icon.svg"]).catch(() => undefined))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({ data: null, error: { code: "OFFLINE", message: "You're offline. Saved crates and history are still here; streams aren't." }, requestId: "sw" }), { status: 503, headers: { "content-type": "application/json" } })));
    return;
  }
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)).catch(() => undefined); return res; }).catch(() => caches.match(e.request).then((m) => m ?? caches.match("/"))));
});
