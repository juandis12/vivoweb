// Service Worker deshabilitado para evitar caché del proyecto.
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
            .then(() => self.registration.unregister())
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // No responder con caché: siempre ir a red, y si no hay red, devolver el recurso por defecto.
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});

