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
 * Servicio TMDB v3.1 — Todas las llamadas a la API sin persistencia.
 */
export const TMDB_SERVICE = {
    async fetchFromTMDB(endpoint, params = {}) {
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
            if (!res.ok) {
                if (res.status === 404) return { error: 404 }; // Silencio administrativo para 404
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
    
    async getDetails(id, type = 'movie') {
        const data = await TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}`, { append_to_response: 'genres' });
        
        // --- OPTIMIZACIÓN VIVOTV: Evitar llamadas redundantes y Errores 406 ---
        if (data && data.id) {
            const strId = data.id.toString();
            // 1. Verificar si ya conocemos esta película en nuestro catálogo local
            const isKnown = window.DB_CATALOG && window.DB_CATALOG.some(item => item.tmdb_id === strId);

            if (!isKnown) {
                try {
                    // Solo insertamos si realmente no la conocemos (Cache pasivo)
                    const contentData = {
                        tmdb_id: parseInt(strId),
                        title: data.title || data.name || '',
                        description: data.overview || '', // Corregido: description (según SQL)
                        poster_url: data.poster_path || '',
                        backdrop_url: data.backdrop_path || '',
                        video_url: 'source_id:' + strId, // Obligatorio (NOT NULL en SQL)
                        rating: data.vote_average || 0,   // Corregido: rating (según SQL)
                        release_date: data.release_date || data.first_air_date || '',
                        content_type: type === 'tv' ? 'series' : 'movie'
                    };
                    
                    /* 
                       ELIMINADO POR RLS (Error 403):
                       Tu configuración de Supabase no permite que usuarios externos guarden datos en 'content'.
                       Silenciamos este paso para mantener la consola limpia.
                    */
                    // console.log(`[VivoTV] 🔒 Saltando guardado en DB (RLS) para: ${strId}`);
                    /*
                    supabase.from('content').insert(contentData).then(({error}) => {
                        if (!error && window.DB_CATALOG) {
                            window.DB_CATALOG.push(contentData);
                        }
                    });
                    */
                } catch (e) {
                    console.warn('[VivoTV] Error en autoguardado pasivo:', e);
                }
            }
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
