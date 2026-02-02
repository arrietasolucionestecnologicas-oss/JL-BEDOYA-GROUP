// sw.js - Service Worker
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Instalado correctamente');
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[Service Worker] Activado');
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Respondemos siempre con la red para evitar datos viejos
  e.respondWith(fetch(e.request));
});
