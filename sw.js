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

// Fetch (Cache First, then Network)
self.addEventListener('fetch', (event) => {
    // Evitar cache para las peticiones de API (TMDB/Supabase)
    if (event.request.url.includes('api.themoviedb.org') || 
        event.request.url.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => response || fetch(event.request))
    );
});
