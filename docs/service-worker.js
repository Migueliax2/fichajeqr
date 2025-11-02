// ✅ versión nueva para forzar actualización
const CACHE_NAME = "sb-cache-v10";

// ✅ lista explícita de recursos a cachear (ajústala si añades más)
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

// ✅ filtra URLs raras (chrome-extension://, etc.)
function isHttpUrl(u) {
  try {
    const url = new URL(u, self.location);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const toCache = ASSETS.filter(isHttpUrl);
    await cache.addAll(toCache);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // borra caches antiguos
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // solo cacheamos http/https
  if (!isHttpUrl(req.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      // clona en cache si es 200 y del mismo origen
      if (res.status === 200 && new URL(req.url).origin === self.location.origin) {
        cache.put(req, res.clone());
      }
      return res;
    } catch {
      // opcional: devolver index.html offline
      const fallback = await cache.match("./index.html");
      return fallback || new Response("Offline", { status: 503 });
    }
  })());
});
