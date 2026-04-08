import { CONFIG } from './config.js';
import { VivoCache } from './cache.js';

// Helper para escapar HTML y prevenir XSS (Fase 3: Seguridad)
function _escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Servicio TMDB v3.1 — Todas las llamadas a la API con persistencia IndexedDB.
 */
export const TMDB_SERVICE = {
    _cache: new Map(), // Memoria volátil para acceso inmediato

    async fetchFromTMDB(endpoint, params = {}) {
        const cacheKey = `vivotv_api_cache_v2_${endpoint}_${JSON.stringify(params)}`;
        
        // 1. Verificar Cache de MEMORIA (Nivel 1)
        if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

        // 2. Verificar Cache PERSISTENTE (Nivel 2: IndexedDB)
        const cached = await VivoCache.get(cacheKey);
        if (cached) {
            console.log(`[VivoCache] Hit: ${endpoint}`);
            this._cache.set(cacheKey, cached);
            return cached;
        }

        const currentProfile = JSON.parse(sessionStorage.getItem('vivotv_current_profile'));
        const isKids = currentProfile?.is_kids === true;
        
        let url;
        if (CONFIG.USE_PROXY) {
            url = new URL(window.location.origin + CONFIG.TMDB_PROXY_URL);
            const cleanPath = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
            url.searchParams.append('path', cleanPath);
        } else {
            const _k = CONFIG._tk;
            url = new URL(`https://api.themoviedb.org/3${endpoint}`);
            url.searchParams.append('api_key', _k);
            url.searchParams.append('language', 'es-MX');
        }

        if (isKids) {
            url.searchParams.append('certification_country', 'US');
            url.searchParams.append('certification.lte', 'PG-13');
            url.searchParams.append('include_adult', 'false');
        }

        Object.entries(params).forEach(([key, val]) => url.searchParams.append(key, val));

        try {
            const res = await fetch(url.toString());
            if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
            const data = await res.json();
            
            // 3. Guardar en AMBOS niveles de cache
            this._cache.set(cacheKey, data);
            await VivoCache.set(cacheKey, data);
            
            return data;
        } catch (e) {
            console.error(`TMDB fetch error (${endpoint}):`, e);
            return { results: [] };
        }
    },

    getTrending: (type = 'all', window = 'day') =>
        TMDB_SERVICE.fetchFromTMDB(`/trending/${type}/${window}`),
    getPopularMovies: (page = 1) => TMDB_SERVICE.fetchFromTMDB('/movie/popular', { page }),
    getTopRated: (page = 1)     => TMDB_SERVICE.fetchFromTMDB('/movie/top_rated', { page }),
    getPopularTV: (page = 1)    => TMDB_SERVICE.fetchFromTMDB('/tv/popular', { page }),
    
    async getDetails(id, type = 'movie') {
        const cacheKey = `vivotv_cache_${type}_${id}`;
        // 1. Memory Cache
        if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);
        
        // 2. Persistent Cache (Session)
        const stored = sessionStorage.getItem(cacheKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            this._cache.set(cacheKey, parsed);
            return parsed;
        }
        
        const data = await TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}`, { append_to_response: 'genres' });
        if (data && data.id) {
            this._cache.set(cacheKey, data);
            sessionStorage.setItem(cacheKey, JSON.stringify(data));
        }
        return data;
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

// TMDB_SERVICE is now the only export from this file.
// CATALOG_UI has been moved to ui.js for better modularity.

