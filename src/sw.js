// Service Worker: erst Netz, dann Cache. So gibt es nach einem Deploy sofort den neuen Stand (kein Mix aus alten
// und neuen Modulen); ohne Netz startet die App aus dem Cache. Lokal (localhost) wird er nicht registriert.
const CACHE = 'mx-sports-v3';

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

// Push-Erinnerung anzeigen
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'mx sports', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: d.id || 'mx-sports', data: { url: d.url || '/#/heute' },
  }));
});

// Tippen auf die Mitteilung → App öffnen bzw. nach vorne holen
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/#/heute';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list.find(c => new URL(c.url).origin === location.origin);
    if (win) return win.focus().then(w => w.navigate?.(url));
    return self.clients.openWindow(url);
  }));
});
