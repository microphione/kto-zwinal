// Offline support. Same-origin files: network first (revalidated, so GitHub Pages' max-age never serves a
// stale file and all modules come from one deploy), the cache only when offline. Web fonts: cache first.
const CACHE = 'ktozwinal-v2';
const FONTS = 'ktozwinal-fonts';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'ui/app.js', 'ui/gen-worker.js',
  'src/board.js', 'src/generator.js', 'src/rng.js', 'src/solver.js', 'src/statements.js', 'src/steps.js', 'src/text.js',
  'puzzles/samouczek.json', 'puzzles/misja-1.json', 'puzzles/misja-2.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(url => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === location.origin) {
    e.respondWith(caches.open(CACHE).then(async cache => {
      try {
        const res = await fetch(request, { cache: 'no-cache' });
        if (res.ok) cache.put(request, res.clone());
        return res;
      } catch (err) {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        throw err;
      }
    }));
  } else if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const res = await fetch(request);
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
      return res;
    }));
  }
});
