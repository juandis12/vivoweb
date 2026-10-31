const CACHE_NAME = 'vivotv-cache-v8';
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'manifest.json',
    'styles.css',
    'netflix-layout.css',
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
    'js/vibe-engine.js',
    'js/update-notifier.js'
];

// Instalación: Cachear activos críticos con tolerancia a fallos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                ASSETS_TO_CACHE.map(asset => 
                    cache.add(asset).catch(err => {
                        console.warn('[SW] Aviso: No se pudo cachear:', asset, err.message);
                    })
                )
            );
        })
    );
});

// Activación: Purgar cachés viejas y tomar control inmediato
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => {
                    console.log('[SW] Purgando caché obsoleta:', key);
                    return caches.delete(key);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Escuchar mensajes del cliente (Skip Waiting & Prefetch)
self.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'SKIP_WAITING') {
        console.log('[SW] skipWaiting ejecutado a petición del usuario.');
        self.skipWaiting();
    }

    if (event.data.type === 'PREFETCH_POSTERS' && Array.isArray(event.data.urls)) {
        caches.open(CACHE_NAME).then(cache => {
            event.data.urls.forEach(url => cache.add(url).catch(() => {}));
        });
    }
});

// Estrategia de Red Inteligente
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = event.request.url;

    // 1. NUNCA cachear SW, version.json o llamadas dinámicas a APIs/Supabase
    if (url.includes('version.json') || 
        url.includes('sw.js') || 
        url.includes('/api/') || 
        url.includes('supabase.co')) {
        return; // Pasa directo a la red sin interceptar
    }

    // 2. Ignorar imágenes de TMDB para evitar CORS/cuotas en SW
    if (url.includes('image.tmdb.org')) return;

    // 3. Documentos HTML (Navegación): Network-First para siempre ver la versión más reciente
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(event.request)
                        .then(cached => cached || caches.match('./index.html'));
                })
        );
        return;
    }

    // 4. Recursos estáticos (CSS, JS, iconos): Stale-While-Revalidate
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const cacheCopy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
                }
                return networkResponse;
            }).catch(() => {
                return new Response('', { status: 408, statusText: 'Network Error' });
            });

            return cachedResponse || fetchPromise;
        })
    );
});
