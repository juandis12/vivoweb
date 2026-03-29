import { CONFIG } from './config.js';

/**
 * Servicio TMDB v2.1 — Todas las llamadas a la API de TMDB centralizadas aquí.
 */
export const TMDB_SERVICE = {

    // Fix #8: Object.entries() en lugar de for...in (más robusto, evita props heredadas)
    async fetchFromTMDB(endpoint, params = {}) {
        let url;
        if (CONFIG.USE_PROXY) {
            url = new URL(window.location.origin + CONFIG.TMDB_PROXY_URL);
            const cleanPath = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
            url.searchParams.append('path', cleanPath);
        } else {
            console.warn("⚠️ MODO DESARROLLADOR: Consumiendo TMDB vía Front-end (Live Server detectado). Esto no es seguro para Producción.");
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
    getDetails: (id, type = 'movie') =>
        TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}`, { append_to_response: 'genres' }),
    search: (query) => TMDB_SERVICE.fetchFromTMDB('/search/multi', { query }),

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
            // En caso que el render fuera con innerHTML, el textContent lo protege nativamente
            heroBanner.style.backgroundImage = `url('${CONFIG.TMDB_IMAGE_HERO}${movie.backdrop_path}')`;

            const year   = (movie.release_date || movie.first_air_date || '').split('-')[0];
            const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
            
            if (heroMeta) {
                heroMeta.innerHTML = `
                    <span class="meta-chip">${year}</span>
                    <span class="meta-chip badge-gold">⭐ ${rating}</span>
                    <span class="meta-chip">4K Ultra HD</span>
                `;
            }

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
        
        // Actualizar título si se proporciona
        if (titleOverride) {
            const section = container.closest('.catalog-row');
            const rowTitle = section?.querySelector('.row-title');
            if (rowTitle) rowTitle.textContent = titleOverride;
        }

        // Limpiar skeletons si existen
        container.innerHTML = '';

        if (!items || items.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);padding:20px 0;">No hay resultados disponibles.</p>';
            return;
        }

        items.forEach(item => {
            if (!item.poster_path) return;
            const type = typeOverride || item.media_type || (containerId.includes('TV') ? 'tv' : 'movie');
            const isAvail = availableIds.has(item.id.toString()) || availableIds.has(item.id);
            const card = this.createMovieCard(item, type, isAvail);
            container.appendChild(card);
        });
    },

    createMovieCard(item, type, isAvailable = false) {
        const card = document.createElement('div');
        card.className = `movie-card${isAvailable ? ' is-available' : ''}`;
        card.dataset.tmdbId = item.id;
        card.dataset.type = type;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Ver ${item.title || item.name}${isAvailable ? ' (Disponible)' : ''}`);

        const year   = (item.release_date || item.first_air_date || '').split('-')[0];
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
        const rawTitle  = item.title || item.name || '';
        const title  = _escapeHTML(rawTitle);
        const overview = _escapeHTML(item.overview || 'Sin descripción disponible.');

        card.innerHTML = `
            <div class="movie-card-inner">
                <img src="${CONFIG.TMDB_IMAGE_CARD}${item.poster_path}" alt="${title}" loading="lazy">
                <div class="movie-card-title">${title}</div>
                ${isAvailable ? `
                    <div class="available-badge">
                        <svg viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 
                        DISPONIBLE
                    </div>` : ''}
            </div>
            <div class="movie-tooltip">
                <h4>${title}</h4>
                <p>${overview}</p>
                <div class="movie-tooltip-meta">
                    <span class="movie-tooltip-rating">⭐ ${rating}</span>
                    <span class="movie-tooltip-year">${year}</span>
                </div>
                <button class="movie-tooltip-btn">▶ Reproducir</button>
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
