// sw.js - Service Worker Mínimo para PWA
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
});
self.addEventListener('fetch', (e) => {
  // Necesario para que sea instalable
});
