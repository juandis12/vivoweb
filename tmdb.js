import { CONFIG } from './config.js';

/**
 * Servicio TMDB v2.1 — Todas las llamadas a la API de TMDB centralizadas aquí.
 */
export const TMDB_SERVICE = {
    _cache: new Map(), // Caché en memoria para evitar peticiones redundantes

    // Fix #8: Object.entries() en lugar de for...in (más robusto, evita props heredadas)
    async fetchFromTMDB(endpoint, params = {}) {
        let url;
        if (CONFIG.USE_PROXY) {
            url = new URL(window.location.origin + CONFIG.TMDB_PROXY_URL);
            const cleanPath = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
            url.searchParams.append('path', cleanPath);
        } else {
            if (!CONFIG.USE_PROXY) console.warn("⚠️ MODO DESARROLLADOR: Consumiendo TMDB vía Front-end (Live Server detectado). Esto no es seguro para Producción.");
            const _k = atob(CONFIG._tk);
            url = new URL(`https://api.themoviedb.org/3${endpoint}`);
            url.searchParams.append('api_key', _k);
            url.searchParams.append('language', 'es-MX');
        }

        Object.entries(params).forEach(([key, val]) => url.searchParams.append(key, val));

        try {
            const res = await fetch(url.toString());
            if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
            return await res.json();
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
        const cacheKey = `${type}_${id}`;
        if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);
        
        const data = await TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}`, { append_to_response: 'genres' });
        if (data && data.id) this._cache.set(cacheKey, data);
        return data;
    },

    search: (query) => TMDB_SERVICE.fetchFromTMDB('/search/multi', { query }),
    getCredits: (id, type = 'movie') => TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}/credits`),
    getSeasonDetails: (id, seasonNumber) => TMDB_SERVICE.fetchFromTMDB(`/tv/${id}/season/${seasonNumber}`),

    async getImagesForAuthBg() {
        const data = await TMDB_SERVICE.fetchFromTMDB('/trending/movie/week');
        return (data.results || []).filter(m => m.backdrop_path).slice(0, 32);
    },
};

/**
 * Motor de Renderizado de la UI del Catálogo
 */

function _escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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
            heroTitle.textContent   = movie.title || movie.name;
            heroOverview.textContent = movie.overview || 'Sin descripción disponible.';
            heroBanner.style.backgroundImage = `url('${CONFIG.TMDB_IMAGE_HERO}${movie.backdrop_path}')`;

            const year   = (movie.release_date || movie.first_air_date || '').split('-')[0];
            const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
            const badge  = document.querySelector('.hero-badge');
            if (badge) badge.textContent = (movie.media_type === 'tv' ? 'SERIE DESTACADA' : 'PELÍCULA DESTACADA');

            const yearEl = document.getElementById('heroYear');
            const durationEl = document.getElementById('heroDuration');
            const ratingEl = document.getElementById('heroRating');

            if (yearEl) yearEl.textContent = year;
            if (durationEl) durationEl.textContent = movie.runtime ? `${movie.runtime} min` : '2h 15min';
            if (ratingEl) ratingEl.textContent = `★ ${rating}`;

            if (btnPlay) {
                btnPlay.dataset.tmdbId = movie.id;
                btnPlay.dataset.type   = movie.media_type || 'movie';
            }
            if (btnInfo) {
                btnInfo.dataset.tmdbId = movie.id;
                btnInfo.dataset.type   = movie.media_type || 'movie';
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

    renderCarousel(containerId, items, typeOverride = null, availableIds = new Set(), titleOverride = null) {
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

        const isRankedRow = containerId.toLowerCase().includes('trending') || containerId.toLowerCase().includes('top');

        items.forEach((item, index) => {
            if (!item.poster_path) return;
            const type = typeOverride || item.media_type || (containerId.includes('TV') ? 'tv' : 'movie');
            const isAvail = availableIds.has(item.id.toString()) || availableIds.has(item.id);
            const rank = isRankedRow && index < 10 ? index + 1 : null;
            const card = this.createMovieCard(item, type, isAvail, rank);
            container.appendChild(card);
        });
    },

    createMovieCard(item, type, isAvailable = false, rank = null) {
        const card = document.createElement('div');
        card.className = `movie-card${isAvailable ? ' is-available' : ''}${rank ? ' ranked' : ''}`;
        card.dataset.tmdbId = item.id;
        card.dataset.type = type;

        const year   = (item.release_date || item.first_air_date || '').split('-')[0];
        const rating = item.vote_average ? item.vote_average.toFixed(1) : '9.5'; // Soft match fallback
        const title  = _escapeHTML(item.title || item.name || '');

        const genresList = (item.genre_ids || []).slice(0, 3).map(id => this.getGenreName(id)).filter(Boolean).join(' • ');

        card.innerHTML = `
            ${rank ? `<div class="rank-number">${rank}</div>` : ''}
            <div class="movie-card-inner">
                <img src="${CONFIG.TMDB_IMAGE_CARD}${item.poster_path}" alt="${title}" loading="lazy">
                <div class="movie-card-title">${title}</div>
                ${isAvailable ? `
                    <div class="available-badge">
                        <svg viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 
                        DISPONIBLE
                    </div>` : `
                    <div class="coming-soon-badge">PRÓXIMAMENTE</div>`}
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
        movies.forEach(m => {
            const img  = document.createElement('img');
            img.src    = `${CONFIG.TMDB_IMAGE_CARD}${m.poster_path || m.backdrop_path}`;
            img.alt    = '';
            img.loading = 'lazy';
            grid.appendChild(img);
        });
    },
};
