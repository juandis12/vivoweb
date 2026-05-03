const CACHE_NAME = 'vivotv-cache-v6';
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'manifest.json',
    'css/styles.css',
    'js/app.js',
    'js/config.js',
    'js/auth.js',
    'js/catalog.js',
    'js/ui.js',
    'js/tmdb.js',
    'js/db.js',
    'js/player.js',
    'js/watch-party-guide.js',
    'js/achievements.js',
    'js/social-pulse.js',
    'js/ambient-fx.js',
    'js/vibe-engine.js'
];

// Instalación: Cachear activos críticos
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
                if (networkResponse && networkResponse.status === 200) {
                    const cacheCopy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
                }
                return networkResponse;
            }).catch(() => {
                // Silencio total en la consola para errores de red
                return new Response('', { status: 408, statusText: 'Network Error' });
            });

            return cachedResponse || fetchPromise;
        })
    );
});
