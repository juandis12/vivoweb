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
            if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
            const data = await res.json();

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

/**
 * Motor de Renderizado de la UI del Catálogo
 */
export const CATALOG_UI = {

    renderHero(movie, heroItems = []) {
        const heroTitle   = document.getElementById('heroTitle');
        const heroOverview = document.getElementById('heroOverview');
        const heroBanner  = document.getElementById('heroBanner');
        const heroMeta    = document.getElementById('heroMeta');
        const indicators  = document.getElementById('heroIndicators');
        const btnPlay     = document.getElementById('btnHeroPlay');
        const btnInfo     = document.getElementById('btnHeroInfo');

        if (!movie || !heroBanner) return;

        // Cinematic Fade Transition
        heroBanner.style.opacity = '0';
        
        setTimeout(() => {
            // Soporte Dual: DB (backdrop_url) o TMDB (backdrop_path)
            const backdrop = movie.backdrop_url || (movie.backdrop_path ? `${CONFIG.TMDB_IMAGE_HERO}${movie.backdrop_path}` : '');
            if (backdrop) heroBanner.style.backgroundImage = `url('${backdrop}')`;

            heroTitle.textContent   = movie.title || movie.name;
            heroOverview.textContent = movie.description || movie.overview || 'Sin descripción disponible.';

            const year   = (movie.release_date || movie.first_air_date || '').split('-')[0];
            const rating = movie.vote_average ? movie.vote_average.toFixed(1) : (movie.rating || '9.5');
            const badge  = document.querySelector('.hero-badge');
            
            const type = movie.content_type || movie.media_type || (movie.first_air_date ? 'tv' : 'movie');
            if (badge) badge.textContent = (type === 'tv' ? 'SERIE DESTACADA' : 'PELÍCULA DESTACADA');

            const yearEl = document.getElementById('heroYear');
            const durationEl = document.getElementById('heroDuration');
            const ratingEl = document.getElementById('heroRating');

            if (yearEl) yearEl.textContent = year;
            const runtime = movie.runtime || movie.duration;
            if (durationEl) durationEl.textContent = runtime ? (typeof runtime === 'number' ? `${runtime} min` : runtime) : '2h 15min';
            if (ratingEl) ratingEl.textContent = `★ ${rating}`;

            const finalId = movie.id || movie.tmdb_id;
            if (btnPlay) {
                btnPlay.dataset.tmdbId = finalId;
                btnPlay.dataset.type   = type;
            }
            if (btnInfo) {
                btnInfo.dataset.tmdbId = finalId;
                btnInfo.dataset.type   = type;
            }

            heroBanner.style.opacity = '1';
        }, 500);

        // Update dots
        if (indicators && heroItems.length > 1) {
            indicators.innerHTML = '';
            const activeIndex = heroItems.indexOf(movie);
            heroItems.slice(0, 8).forEach((item, i) => {
                const dot = document.createElement('div');
                dot.className = `hero-dot ${i === activeIndex ? 'active' : ''}`;
                indicators.appendChild(dot);
            });
        }
    },

    getGenreName(id) {
        const genres = {
            28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
            80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
            14: 'Fantástico', 36: 'Historia', 27: 'Terror', 10402: 'Música',
            9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia Ficción',
            53: 'Suspenso', 10752: 'Bélico', 37: 'Western',
        };
        return genres[id] || '';
    },


    showSkeletons(containerId, count = 6) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        const skeletonWrap = document.createElement('div');
        skeletonWrap.className = 'carousel-skeleton';
        for (let i = 0; i < count; i++) {
            const item = document.createElement('div');
            item.className = 'skeleton-card';
            skeletonWrap.appendChild(item);
        }
        container.appendChild(skeletonWrap);
    },

    renderCarousel(containerId, items, typeOverride = null, availableIds = new Set(), titleOverride = null, dbCatalog = []) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (titleOverride) {
            const section = container.closest('.catalog-row');
            const rowTitle = section?.querySelector('.row-title');
            if (rowTitle) rowTitle.textContent = titleOverride;
        }

        container.innerHTML = '';

        if (!items || items.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);padding:20px 0;">No hay resultados disponibles.</p>';
            return;
        }

        // Renderizado inmediato: el row debe cargar sin depender de la visibilidad.
        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            // Soporte Dual: DB (poster_url) o TMDB (poster_path)
            if (!item.poster_path && !item.poster_url) return;
            
            const type = typeOverride || item.content_type || item.media_type || (containerId.includes('TV') ? 'tv' : 'movie');
            const isAvail = CATALOG_UI.isItemAvailable(item, availableIds, dbCatalog, type);
            
            const card = CATALOG_UI.createMovieCard(item, type, isAvail);
            fragment.appendChild(card);
        });
        container.appendChild(fragment);
    },

    isItemAvailable(item, availableIds = null, dbCatalog = null, type = null) {
        // Asegurar que usamos los Sets globales si no se pasan parámetros (Fix SPA Sync)
        const _ids = (availableIds && (availableIds instanceof Set) && availableIds.size > 0) ? availableIds : (window.availableIds || new Set());
        const _db  = (dbCatalog && Array.isArray(dbCatalog) && dbCatalog.length > 0) ? dbCatalog : (window.DB_CATALOG || []);

        const id = item.id || item.tmdb_id;
        if (!id) return false;
        
        const idStr = id.toString();

        // 1. Verificamos disponibilidad directa en los Sets de Supabase
        if (_ids.has(idStr)) return true;

        // 2. Verificamos si existe metadato en el catálogo local (Respaldo Crítico)
        return _db.some(db => db.tmdb_id?.toString() === idStr);
    },

    createMovieCard(item, type, isAvailable = false, rank = null, progress = null) {
        const card = document.createElement('div');
        card.className = `movie-card${isAvailable ? ' is-available' : ''}${rank ? ' ranked' : ''}`;
        card.dataset.tmdbId = item.id || item.tmdb_id;
        card.dataset.type = type || item.content_type || item.media_type;

        const year   = (item.release_date || item.first_air_date || '').split('-')[0];
        const rating = item.vote_average ? item.vote_average.toFixed(1) : (item.rating || '9.5');
        const title  = _escapeHTML(item.title || item.name || '');

        // Soporte Dual: DB (poster_url) vs TMDB (poster_path)
        const posterImg = item.poster_url || (item.poster_path ? `${CONFIG.TMDB_IMAGE_CARD}${item.poster_path}` : 'assets/no-poster.png');

        const genresList = (item.genre_ids || []).slice(0, 3).map(id => this.getGenreName(id)).filter(Boolean).join(' • ');

        // Lógica de "Visto" (> 95%) - Fase Persistencia
        const isWatched = progress && progress >= 95;

        card.innerHTML = `
            ${rank ? `<div class="rank-number">${rank}</div>` : ''}
            <div class="movie-card-inner">
                <img src="${posterImg}" alt="${title}" loading="lazy">
                <div class="movie-card-title">${title}</div>
                
                ${isWatched ? `
                    <div class="watched-badge watched-premium">
                        <svg viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                        VISTO
                    </div>
                ` : (isAvailable ? `
                    <div class="available-badge">
                        <svg viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 
                        DISPONIBLE
                    </div>` : `
                    <div class="coming-soon-badge">PRÓXIMAMENTE</div>`)}

                ${(progress !== null && progress > 0) && !isWatched ? `
                    <div class="card-progress-bar">
                        <div class="card-progress-fill" style="width: ${progress}%"></div>
                    </div>
                ` : ''}
            </div>
            <div class="movie-tooltip">
                <div class="movie-tooltip-actions">
                    <button class="movie-tooltip-btn btn-play" title="Reproducir">▶</button>
                    <button class="movie-tooltip-btn btn-outline-rnd" title="Añadir a Mi Lista">+</button>
                </div>
                <div class="movie-tooltip-meta">
                    <span class="movie-tooltip-rating">${rating} Match</span>
                    <span class="movie-tooltip-year">${year}</span>
                    <span class="badge-hd">HD</span>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 8px;">${genresList}</div>
            </div>`;

        const openDetail = () => window.dispatchEvent(
            new CustomEvent('open-movie-detail', { detail: { tmdbId: item.id, type } })
        );

        card.addEventListener('click', openDetail);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(); }
        });
        card.querySelector('.movie-tooltip-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openDetail();
        });

        return card;
    },

    renderAuthBg(movies) {
        const grid = document.getElementById('authBgGrid');
        if (!grid) return;
        grid.innerHTML = '';
        const fragment = document.createDocumentFragment();
        movies.forEach(m => {
            const img  = document.createElement('img');
            img.src    = `${CONFIG.TMDB_IMAGE_CARD}${m.poster_path || m.backdrop_path}`;
            img.alt    = '';
            img.loading = 'lazy';
            fragment.appendChild(img);
        });
        grid.appendChild(fragment);
    },

    renderTop10(containerId, results, availableIds, dbCatalog = []) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        results.forEach((item, index) => {
            const type = item.media_type || (item.title ? 'movie' : 'tv');
            const isAvail = CATALOG_UI.isItemAvailable(item, availableIds, dbCatalog, type);
            const card = this.createTop10Card(item, index + 1, isAvail, type);
            fragment.appendChild(card);
        });
        container.appendChild(fragment);
    },

    createTop10Card(item, rank, isAvailable, type) {
        const wrapper = document.createElement('div');
        wrapper.className = 'top-10-card';
        const num = document.createElement('div');
        num.className = 'top-10-number';
        num.textContent = rank;
        const card = this.createMovieCard(item, type, isAvailable);
        wrapper.appendChild(num);
        wrapper.appendChild(card);
        return wrapper;
    }
};
