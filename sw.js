const CACHE_NAME = 'jlb-ops-v_FINAL_2'; // <--- CAMBIO CRÍTICO PARA FORZAR ACTUALIZACIÓN
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

// =======================================================
// BACKGROUND SYNC — Cola de fotos offline
// =======================================================
const API_ENDPOINT_SW = "https://script.google.com/macros/s/AKfycbzdW332Skk5Po7SHLzOddgzLe2Am3WyPpQ6B9bYJI08Nz9sk8kAmWAX28HvAv3BFk-15A/exec";
const DB_NAME_SW = 'JLB_OfflineDB';
const STORE_SW = 'fotos_pendientes';

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-fotos-jlb') {
        event.waitUntil(doBackgroundSync());
    }
});

function abrirDBSW() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME_SW, 1);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
    });
}

async function doBackgroundSync() {
    let db;
    try { db = await abrirDBSW(); } catch(e) { return; }

    const pendientes = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SW, 'readonly');
        const req = tx.objectStore(STORE_SW).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    if (!pendientes || pendientes.length === 0) return;

    let sincronizadas = 0;
    for (const item of pendientes) {
        try {
            const horaUTC = new Date().toISOString().slice(0, 13);
            const token = btoa("JLB_PROD_" + horaUTC);
            const res = await fetch(API_ENDPOINT_SW, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: 'subirFotoProceso', payload: item.payload, token })
            });
            const wrapper = await res.json();
            const result = wrapper.data !== undefined ? wrapper.data : wrapper;
            if (wrapper.status !== 'error' && (result.exito || result.success)) {
                await new Promise((res2, rej2) => {
                    const txDel = db.transaction(STORE_SW, 'readwrite');
                    txDel.objectStore(STORE_SW).delete(item.id);
                    txDel.oncomplete = res2;
                    txDel.onerror = () => rej2(txDel.error);
                });
                sincronizadas++;
            }
        } catch(e) { /* foto queda en cola para próximo intento */ }
    }

    if (sincronizadas > 0) {
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach(c => c.postMessage({ type: 'FOTOS_SINCRONIZADAS', cantidad: sincronizadas }));
    }
}
