/* Mes Finances — fonctionnement hors ligne.
   Réseau d'abord (4 s max), sinon la copie enregistrée sur l'appareil. */
const CACHE = 'fw-v8';
const FICHIERS = ['./', './index.html', './app.js', './bot.js', './manifest.webmanifest',
                  './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  /* Chaque fichier est mis en cache séparément : un fichier manquant ne bloque pas les autres. */
  e.waitUntil(caches.open(CACHE).then(c =>
    Promise.all(FICHIERS.map(f => c.add(new Request(f, {cache: 'reload'})).catch(() => null)))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const delai = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), ms));

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // Google : jamais en cache
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const r = await Promise.race([fetch(e.request), delai(4000)]);
      if (r && r.ok) cache.put(e.request, r.clone());
      return r;
    } catch (err) {
      const c = await cache.match(e.request, {ignoreSearch: true});
      if (c) return c;
      if (e.request.mode === 'navigate')
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      return Response.error();
    }
  })());
});
