import { CONFIG, supabase } from './config.js';

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
 * Servicio TMDB v3.2 — Endpoint ligero vs. completo separados.
 */
export const TMDB_SERVICE = {
    async fetchFromTMDB(endpoint, params = {}) {
        const currentProfile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
        const isKids = currentProfile?.is_kids === true;

        const cleanPath = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
        const url = new URL(window.location.origin + CONFIG.TMDB_PROXY_URL);
        url.searchParams.append('path', cleanPath);

        if (isKids) {
            url.searchParams.append('certification_country', 'US');
            url.searchParams.append('certification.lte', 'PG-13');
            url.searchParams.append('include_adult', 'false');
        }

        Object.entries(params).forEach(([key, val]) => url.searchParams.append(key, val));

        try {
            const res = await fetch(url.toString());
            if (!res.ok) {
                if (res.status === 404) {
                    return { error: 404, message: 'Not Found' };
                }
                throw new Error(`TMDB HTTP ${res.status}`);
            }
            const data = await res.json();
            return data;
        } catch (e) {
            if (e.message !== 'TMDB HTTP 404') {
                console.error(`TMDB fetch error (${endpoint}):`, e);
            }
            return { results: [], error: e.message };
        }
    },

    getTrending: (type = 'all', window = 'day') =>
        TMDB_SERVICE.fetchFromTMDB(`/trending/${type}/${window}`),
    getPopularMovies: (page = 1) => TMDB_SERVICE.fetchFromTMDB('/movie/popular', { page }),
    getTopRated: (page = 1)     => TMDB_SERVICE.fetchFromTMDB('/movie/top_rated', { page }),
    getPopularTV: (page = 1)    => TMDB_SERVICE.fetchFromTMDB('/tv/popular', { page }),
    
    // ─── ENDPOINT LIGERO ─────────────────────────────────────────────────────
    // Sólo trae: id, title/name, poster_path, backdrop_path, genres, vote_average.
    // Se usa en el sync masivo del catálogo (syncMissingMetadata) para reducir
    // el tamaño de respuesta ~60-70% vs. getDetails.
    async getSummary(id, type = 'movie') {
        return TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}`);
    },

    // ─── ENDPOINT COMPLETO ────────────────────────────────────────────────────
    // Agrega genres object completo. Solo se usa cuando ya se tiene el item
    // en pantalla de detalle o cuando getSummary no es suficiente.
    async getDetails(id, type = 'movie') {
        const data = await TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}`, { append_to_response: 'genres' });
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

