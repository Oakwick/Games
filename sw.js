// Oakwick Games service worker: network-first for our own files (so monthly updates
// show up straight away), with a cached copy for offline/poor signal.
// Scoreboard calls go to Google (a different origin) and are never cached.
const CACHE = 'oakwick-2026-12-8';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/oakwick-logo.png', './icons/oakwick-logo-white.png',
  './games/2026-10-line-clear/', './games/2026-10-line-clear/index.html', './games/2026-10-line-clear/style.css',
  './games/2026-10-line-clear/config.js', './games/2026-10-line-clear/trees-data.js',
  './games/2026-10-line-clear/engine.js', './games/2026-10-line-clear/game.js', './site-config.js',
  './games/2026-11-fungi-detective/', './games/2026-11-fungi-detective/index.html', './games/2026-11-fungi-detective/config.js',
  './games/2026-11-fungi-detective/public.js', './games/2026-11-fungi-detective/art.js', './games/2026-11-fungi-detective/scene.js',
  './games/2026-11-fungi-detective/game.js',
  './games/2026-10-line-of-fire/', './games/2026-10-line-of-fire/index.html', './games/2026-10-line-of-fire/config.js',
  './games/2026-10-line-of-fire/engine.js', './games/2026-10-line-of-fire/art.js', './games/2026-10-line-of-fire/game.js',
  './games/2026-12-advent/', './games/2026-12-advent/index.html', './games/2026-12-advent/config.js', './games/2026-12-advent/public.js',
  './games/2026-12-advent/advent-art.js', './games/2026-12-advent/app.js'
];
self.addEventListener('install', (e) => {
  // Each file is saved on its own, so one that is not on the site yet (next month's game) does not stop the rest.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
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
