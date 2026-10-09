/* Mes Finances — fonctionnement hors ligne.
   Réseau d'abord (pour recevoir les mises à jour), cache si pas de connexion. */
const CACHE = 'fw-v2';
const FICHIERS = ['./', './index.html', './app.js', './manifest.webmanifest',
                  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // Google : jamais en cache
  e.respondWith(
    fetch(e.request).then(r => {
      const copie = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copie));
      return r;
    }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match('./index.html')))
  );
});
