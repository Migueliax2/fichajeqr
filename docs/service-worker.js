// Nombre del caché
const CACHE_NAME = "solucionesbot-fichajeqr-v8";
// Ejemplo de safe addAll
const toCache = assets.filter(u => /^https?:\/\//.test(new URL(u, self.location).href) || u.startsWith('./') || u.startsWith('/'));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open('sb-cache-v9'); // sube versión para forzar update
    await cache.addAll(toCache);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});


// Archivos a cachear
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Instalación y cacheo inicial
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});


// Activación y limpieza de versiones antiguas
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Interceptar peticiones y servir desde caché
self.addEventListener("fetch", (e) => {
  const req = e.request;

  // Para evitar cachear llamadas dinámicas (n8n o APIs externas)
  if (req.url.includes("/webhook/") || req.method !== "GET") {
    return; // se deja pasar la petición sin interceptar
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req)
          .then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            return res;
          })
          .catch(() => caches.match("./index.html"))
      );
    })
  );
});
