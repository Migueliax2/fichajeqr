const CACHE = "fichajeqr-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "https://unpkg.com/html5-qrcode"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null)))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e)=>{
  const req = e.request;
  // Network-first for webhook posts; cache-first for assets
  if(req.method !== "GET"){ return; }
  e.respondWith(
    caches.match(req).then(cached=> cached || fetch(req).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(c=>c.put(req, copy));
      return res;
    }).catch(()=>cached))
  );
});
