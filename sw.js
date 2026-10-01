// Oakwick Games service worker: network-first for our own files (so monthly updates
// show up straight away), with a cached copy for offline/poor signal.
// Scoreboard calls go to Google (a different origin) and are never cached.
const CACHE = 'oakwick-2026-10-4';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './games/2026-10-line-clear/', './games/2026-10-line-clear/index.html', './games/2026-10-line-clear/style.css',
  './games/2026-10-line-clear/config.js', './games/2026-10-line-clear/trees-data.js',
  './games/2026-10-line-clear/engine.js', './games/2026-10-line-clear/game.js'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
