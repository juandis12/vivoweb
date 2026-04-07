const CACHE_NAME = 'vivotv-v1';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './player.js',
    './tmdb.js',
    './utils.js',
    './config.js',
    './pwa-icon-512.png'
];

// Instalar Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
    );
});

// Activar e Limpiar Caché antigua
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
});

// Fetch (Stale-While-Revalidate para UI, Cache First para Imágenes)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Excluir Auth de Supabase y peticiones POST
    if (url.href.includes('supabase.co/auth') || event.request.method !== 'GET') {
        return;
    }

    // 2. Estrategia para Imágenes (TMDB y Avatares)
    if (url.href.includes('tmdb.org') || url.pathname.includes('/assets/')) {
        event.respondWith(
            caches.open('vivotv-images').then((cache) => {
                return cache.match(event.request).then((response) => {
                    return response || fetch(event.request).then((networkResponse) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // 3. Estrategia Stale-While-Revalidate para el resto (App Shell)
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            });
            return cachedResponse || fetchPromise;
        })
    );
});
