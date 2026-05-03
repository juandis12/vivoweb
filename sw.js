const CACHE_NAME = 'vivotv-cache-v6';
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'styles.css',
    'js/app.js',
    'js/layout.js',
    'js/ui.js',
    'js/config.js',
    'js/catalog.js',
    'js/auth.js',
    'js/db.js',
    'js/services/AuthService.js',
    'js/services/StreamService.js',
    'assets/no-poster.png'
];

// Instalación: Cachear recursos críticos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Activación: Limpiar caches antiguos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
});

// Estrategia: Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    // Ignorar imágenes externas de TMDB para evitar errores de CORS en el SW
    if (event.request.url.includes('image.tmdb.org')) return;
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                // Guardar una copia actualizada en el cache
                if (networkResponse && networkResponse.status === 200) {
                    const cacheCopy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
                }
                return networkResponse;
            }).catch(() => {
                // Si falla la red y no hay cache, devolver error silencioso o fallback
                return cachedResponse;
            });

            return cachedResponse || fetchPromise;
        })
    );
});
