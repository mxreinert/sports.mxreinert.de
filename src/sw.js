// Service Worker: erst Netz, dann Cache. So gibt es nach einem Deploy sofort den neuen Stand (kein Mix aus alten
// und neuen Modulen); ohne Netz startet die App aus dem Cache. Lokal (localhost) wird er nicht registriert.
const CACHE = 'mx-sports-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  e.respondWith(fetch(request).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(request.mode === 'navigate' ? '/index.html' : request, copy));
    }
    return res;
  }).catch(async () => (await caches.match(request.mode === 'navigate' ? '/index.html' : request)) || Response.error()));
});
