const CACHE_NAME = "skillflow-shell-v4";
const RUNTIME_CACHE = "skillflow-runtime-v4";
const APP_SCOPE = new URL(self.registration.scope);
const normalizeScopedPath = (path = "./") => {
  if (typeof path !== "string") return "./";
  if (path.startsWith("/")) return `.${path}`;
  return path;
};
const resolveAppUrl = (path = "./") => new URL(normalizeScopedPath(path), APP_SCOPE).toString();
const resolveAssetUrl = (path = "") => new URL(normalizeScopedPath(path), APP_SCOPE).toString();
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20260320b",
  "./calendar.js?v=20260320b",
  "./saved-outlines.js?v=20260320b",
  "./pricing-tab.js?v=20260320b",
  "./logo.png",
  "./logo2.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
].map(resolveAppUrl);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![CACHE_NAME, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const runtime = await caches.open(RUNTIME_CACHE);
  runtime.put(request, response.clone()).catch(() => {});
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const runtime = await caches.open(RUNTIME_CACHE);
    runtime.put(request, response.clone()).catch(() => {});
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match(resolveAppUrl("./index.html"));
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isRuntimeLibrary =
    url.origin === "https://www.gstatic.com" ||
    url.origin === "https://cdn.tailwindcss.com";
  const isManifestRequest = isSameOrigin && url.pathname.endsWith("/manifest.webmanifest");

  if (isManifestRequest) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (isSameOrigin || isRuntimeLibrary) {
    event.respondWith(cacheFirst(event.request));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = {
      title: "Skillflow",
      body: event.data ? event.data.text() : "Session update"
    };
  }

  const title = payload.title || "Skillflow";
  const options = {
    body: payload.body || "Session update",
    icon: resolveAssetUrl(payload.icon || "./icons/icon-192.png"),
    badge: resolveAssetUrl(payload.badge || "./icons/icon-192.png"),
    tag: payload.tag || "skillflow-alert",
    renotify: true,
    data: payload.data || { url: "./#home" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  const rawTarget = (event.notification?.data && event.notification.data.url) || "./#home";
  const targetUrl = resolveAppUrl(rawTarget);
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "SHOW_NOTIFICATION") {
    const payload = data.payload || {};
    const title = payload.title || "Skillflow";
    const options = {
      body: payload.body || "Session update",
      icon: resolveAssetUrl(payload.icon || "./icons/icon-192.png"),
      badge: resolveAssetUrl(payload.badge || "./icons/icon-192.png"),
      tag: payload.tag || `skillflow-manual-${Date.now()}`,
      renotify: true,
      data: payload.data || { url: "./#home" }
    };

    const respond = (msg) => {
      if (event.ports && event.ports[0]) {
        try { event.ports[0].postMessage(msg); } catch {}
      }
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
        .then(() => respond({ ok: true }))
        .catch((err) => {
          respond({ ok: false, error: err && err.message ? err.message : String(err) });
        })
    );
  }
});
