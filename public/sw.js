// Service worker desactivado — se auto-elimina para evitar servir archivos viejos cacheados
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// No interceptar ningún fetch — dejar que el navegador use la red directamente
