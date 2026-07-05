const CACHE_NAME = 'mm-v3';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  // Delete ALL old caches so stale JS/CSS from previous deploys is never served.
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Network-first: always try the network; only fall back to cache on failure.
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
