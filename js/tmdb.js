import { CONFIG, supabase } from './config.js';

// Helper para escapar HTML y prevenir XSS
function _escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ─── MOTOR DE CACHÉ PERSISTENTE & RESILIENTE DE ULTRA-ALTO RENDIMIENTO ───────
// Nivel 1: Memoria RAM (0 ms)
// Nivel 2: LocalStorage con TTL de 12 horas (visitas repetidas consumen 0 red)
const _tmdbMemoryCache = new Map();
const TMDB_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 horas
let _proxyDegraded = false; // Bandera de fallback automático si Vercel agota cuota

function _readLocalCache(key) {
    try {
        const raw = localStorage.getItem(`vivotv_tmdb_${key}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp < TMDB_CACHE_TTL) {
            return parsed.data;
        }
        localStorage.removeItem(`vivotv_tmdb_${key}`);
    } catch (e) {}
    return null;
}

function _writeLocalCache(key, data) {
    try {
        const payload = JSON.stringify({ data, timestamp: Date.now() });
        localStorage.setItem(`vivotv_tmdb_${key}`, payload);
    } catch (e) {
        // En caso de cuota de LocalStorage llena, purgar llaves antiguas de TMDB
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('vivotv_tmdb_')) {
                    localStorage.removeItem(k);
                }
            }
        } catch (errClean) {}
    }
}

/**
 * Servicio TMDB v5.0 — Con Resiliencia de Cuota Zero-Downtime y Doble Caché
 */
export const TMDB_SERVICE = {
    async fetchFromTMDB(endpoint, params = {}) {
        const currentProfile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
        const isKids = currentProfile?.is_kids === true;
        const cacheKey = `${endpoint}_${isKids ? 'k1' : 'k0'}_${JSON.stringify(params)}`;

        // 1. Lectura de Memoria RAM Ultrarrápida (0 ms)
        const memCached = _tmdbMemoryCache.get(cacheKey);
        if (memCached && (Date.now() - memCached.timestamp < TMDB_CACHE_TTL)) {
            return memCached.data;
        }

        // 2. Lectura de Almacenamiento Persistente (0 peticiones de red)
        const localCached = _readLocalCache(cacheKey);
        if (localCached) {
            _tmdbMemoryCache.set(cacheKey, { data: localCached, timestamp: Date.now() });
            return localCached;
        }

        const cleanPath = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

        // Construir función de llamada directa a TMDB como fallback infalible
        const fetchDirectTMDB = async () => {
            const directUrl = new URL(`https://api.themoviedb.org/3/${cleanPath}`);
            directUrl.searchParams.append('api_key', CONFIG.TMDB_API_KEY);
            directUrl.searchParams.append('language', 'es-ES');
            if (isKids) {
                directUrl.searchParams.append('certification_country', 'US');
                directUrl.searchParams.append('certification.lte', 'PG-13');
                directUrl.searchParams.append('include_adult', 'false');
            }
            Object.entries(params).forEach(([k, v]) => directUrl.searchParams.append(k, v));
            const directRes = await fetch(directUrl.toString());
            if (!directRes.ok) {
                if (directRes.status === 404) return { error: 404, message: 'Not Found' };
                throw new Error(`Direct TMDB HTTP ${directRes.status}`);
            }
            return await directRes.json();
        };

        // Si ya detectamos que el proxy de Vercel está agotado/degradado en esta sesión, ir directo
        if (_proxyDegraded || !CONFIG.USE_PROXY) {
            try {
                const data = await fetchDirectTMDB();
                if (data && !data.error) {
                    _tmdbMemoryCache.set(cacheKey, { data, timestamp: Date.now() });
                    _writeLocalCache(cacheKey, data);
                }
                return data;
            } catch (errDirect) {
                return { results: [], error: errDirect.message };
            }
        }

        // Si el proxy está habilitado, intentar Vercel Serverless con fallback automático
        const proxyUrl = new URL(window.location.origin + CONFIG.TMDB_PROXY_URL);
        proxyUrl.searchParams.append('path', cleanPath);
        if (isKids) {
            proxyUrl.searchParams.append('certification_country', 'US');
            proxyUrl.searchParams.append('certification.lte', 'PG-13');
            proxyUrl.searchParams.append('include_adult', 'false');
        }
        Object.entries(params).forEach(([key, val]) => proxyUrl.searchParams.append(key, val));

        try {
            const res = await fetch(proxyUrl.toString());
            
            // 🚨 Si Vercel devuelve 402 (Quota Exceeded), 429 (Rate Limit) o 5xx (Error de función):
            if (res.status === 402 || res.status === 429 || res.status >= 500) {
                console.warn(`[TMDB Service] ⚠️ Proxy de Vercel agotado o fallido (${res.status}). Activando fallback directo a TMDB...`);
                _proxyDegraded = true; // No volver a intentar el proxy durante esta sesión
                const directData = await fetchDirectTMDB();
                if (directData && !directData.error) {
                    _tmdbMemoryCache.set(cacheKey, { data: directData, timestamp: Date.now() });
                    _writeLocalCache(cacheKey, directData);
                }
                return directData;
            }

            if (!res.ok) {
                if (res.status === 404) return { error: 404, message: 'Not Found' };
                throw new Error(`TMDB HTTP ${res.status}`);
            }

            const data = await res.json();
            if (data && !data.error) {
                _tmdbMemoryCache.set(cacheKey, { data, timestamp: Date.now() });
                _writeLocalCache(cacheKey, data);
            }
            return data;
        } catch (e) {
            console.warn(`[TMDB Service] 🔄 Error al conectar con proxy (${e.message}). Intentando fallback directo...`);
            _proxyDegraded = true;
            try {
                const fallbackData = await fetchDirectTMDB();
                if (fallbackData && !fallbackData.error) {
                    _tmdbMemoryCache.set(cacheKey, { data: fallbackData, timestamp: Date.now() });
                    _writeLocalCache(cacheKey, fallbackData);
                }
                return fallbackData;
            } catch (errDirect) {
                console.error(`TMDB direct fetch fallback failed (${endpoint}):`, errDirect);
                return { results: [], error: errDirect.message };
            }
        }
    },

    getTrending: (type = 'all', window = 'day') =>
        TMDB_SERVICE.fetchFromTMDB(`/trending/${type}/${window}`),
    getPopularMovies: (page = 1) => TMDB_SERVICE.fetchFromTMDB('/movie/popular', { page }),
    getTopRated: (page = 1)     => TMDB_SERVICE.fetchFromTMDB('/movie/top_rated', { page }),
    getPopularTV: (page = 1)    => TMDB_SERVICE.fetchFromTMDB('/tv/popular', { page }),
    
    // ─── ENDPOINT LIGERO ─────────────────────────────────────────────────────
    async getSummary(id, type = 'movie') {
        return TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}`);
    },

    // ─── ENDPOINT COMPLETO ────────────────────────────────────────────────────
    async getDetails(id, type = 'movie') {
        return TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}`, { append_to_response: 'genres' });
    },

    search: (query) => TMDB_SERVICE.fetchFromTMDB('/search/multi', { query }),
    getCredits: (id, type = 'movie') => TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}/credits`),
    getSeasonDetails: (id, seasonNumber) => TMDB_SERVICE.fetchFromTMDB(`/tv/${id}/season/${seasonNumber}`),
    getVideos: (id, type = 'movie') => TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}/videos`),
    getRecommendations: (id, type = 'movie') => TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}/recommendations`),

    async getImagesForAuthBg() {
        const data = await TMDB_SERVICE.fetchFromTMDB('/trending/movie/week');
        return (data.results || []).filter(m => m.backdrop_path).slice(0, 32);
    },
};
