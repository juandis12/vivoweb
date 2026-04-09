<<<<<<< HEAD
// Service Worker sin caching
self.addEventListener('install', (event) => {
    self.skipWaiting();
=======
// Service Worker deshabilitado para evitar caché del proyecto.
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    );
>>>>>>> 0bc4737443b268fd8d52075126855de3ea3c1301
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
<<<<<<< HEAD
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// No manejar fetch events para evitar cualquier caching
=======
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

>>>>>>> 0bc4737443b268fd8d52075126855de3ea3c1301
