// TELEMIM SW v7 - Offline Support + Push
const CACHE_NAME = "telemim-v7";
const APP_SHELL = ["/", "/index.html", "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Network First, fallback to cache
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Skip supabase API calls from cache (handled by IndexedDB in app)
  if (url.hostname.includes("supabase")) return;
  // Skip chrome-extension and other non-http
  if (!url.protocol.startsWith("http")) return;

  e.respondWith(
    fetch(e.request).then(resp => {
      // Cache successful responses for offline use
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      }
      return resp;
    }).catch(() => {
      // Offline: serve from cache
      return caches.match(e.request).then(cached => cached || new Response("Offline", { status: 503 }));
    })
  );
});

// Push notifications
self.addEventListener("push", e => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || "TELEMIM", {
    body: d.body || "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png"
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.openWindow("/"));
});
