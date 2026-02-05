const CACHE_NAME = 'jlb-ops-v_FINAL'; // <--- CAMBIO CRÍTICO PARA FORZAR ACTUALIZACIÓN
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './icon.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Fuerza al SW a activarse de inmediato
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache); // Borra la caché vieja
          }
        })
      );
    })
  );
});
