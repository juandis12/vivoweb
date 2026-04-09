const CACHE_NAME = 'vivotv-v2'; // Incrementado para forzar actualización
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
    // Forzar que el SW se active inmediatamente
    self.skipWaiting();
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
                keys.filter((key) => key !== CACHE_NAME && key !== 'vivotv-images')
                    .map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim()) // Tomar control de las pestañas inmediatamente
    );
});

// Fetch (Network-First para UI/Scripts, Cache-First para Imágenes)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Excluir Auth de Supabase y peticiones POST (siempre red)
    if (url.href.includes('supabase.co') || event.request.method !== 'GET') {
        return;
    }

    // 2. Estrategia para Imágenes TMDB (Cache-First)
    // Mantenemos esto para ahorrar ancho de banda y velocidad de carga de posters
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

    // 3. Estrategia NETWORK-FIRST para el resto (App Shell / Datos)
    // Primero intenta red para asegurar frescura. Si falla (offline), usa la caché.
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

