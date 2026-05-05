import { CONFIG } from './config.js';
import { TMDB_SERVICE } from './tmdb.js';

/**
 * Motor de Renderizado de la UI del Catálogo (Modularizado)
 */
export const CATALOG_UI = {

    renderHero(movie, heroItems = []) {
        const heroTitle   = document.getElementById('heroTitle');
        const heroOverview = document.getElementById('heroOverview');
        const heroBanner  = document.getElementById('heroBanner');
        const indicators  = document.getElementById('heroIndicators');
        const btnPlay     = document.getElementById('btnHeroPlay');
        const btnInfo     = document.getElementById('btnHeroInfo');

        if (!movie || !heroBanner) return;

        // Cinematic Fade Transition
        heroBanner.style.opacity = '0';
        
        const updateUI = () => {
            const backdrop = movie.backdrop_url || (movie.backdrop_path ? `${CONFIG.TMDB_IMAGE_HERO}${movie.backdrop_path}` : '');
            if (backdrop) {
                // Pre-carga agresiva para evitar parpadeo blanco
                const img = new Image();
                img.src = backdrop;
                img.onload = () => {
                    heroBanner.style.backgroundImage = `url('${backdrop}')`;
                    heroBanner.style.opacity = '1';
                };
            } else {
                heroBanner.style.opacity = '1';
            }

            if (heroTitle) heroTitle.textContent = movie.title || movie.name;
            if (heroOverview) heroOverview.textContent = movie.description || movie.overview || 'Sin descripción disponible.';

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
        };

        // Si es la primera carga o no hay transición previa, ir directo
        if (heroBanner.style.opacity === '1') {
            setTimeout(updateUI, 300); // Pequeño delay para el fade-out si ya había algo
        } else {
            updateUI();
        }

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
        skeletonWrap.className = 'skeleton-grid';
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

        const fragment = document.createDocumentFragment();
        const _ids = (availableIds instanceof Set) ? availableIds : (window.availableIds || new Set());
        
        items.forEach(item => {
            if (!item.poster_path && !item.poster_url) return;
            const type = typeOverride || item.content_type || item.media_type || (containerId.toLowerCase().includes('tv') ? 'tv' : 'movie');
            const id = item.id || item.tmdb_id;
            const isAvail = id ? _ids.has(id.toString()) : false;
            const card = this.createMovieCard(item, type, isAvail);
            fragment.appendChild(card);
        });
        container.appendChild(fragment);
    },

    createMovieCard(item, type, isAvailable = false, rank = null, progress = null) {
        const id = (item.id || item.tmdb_id)?.toString();
        const maintenanceIds = window.maintenanceIds || new Set();
        const isMaintenance = maintenanceIds.has(id);
        
        const card = document.createElement('div');
        card.className = `movie-card${isAvailable && !isMaintenance ? ' is-available' : ''}${isMaintenance ? ' in-maintenance' : ''}${rank ? ' ranked' : ''}`;
        card.dataset.tmdbId = id;
        card.dataset.type = type || item.content_type || item.media_type;

        const year   = (item.release_date || item.first_air_date || '').split('-')[0];
        const rating = item.vote_average ? item.vote_average.toFixed(1) : (item.rating || '9.5');
        const title  = (item.title || item.name || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

        const posterImg = item.poster_url || (item.poster_path ? `${CONFIG.TMDB_IMAGE_CARD}${item.poster_path}` : 'assets/no-poster.png');
        const genresList = (item.genre_ids || []).slice(0, 3).map(id => this.getGenreName(id)).filter(Boolean).join(' • ');
        const isWatched = progress && progress >= 95;

        const isFav = window.VIVOTV_FAVORITES?.has(id);
        const altText = `Ver ${type === 'tv' ? 'serie' : 'película'} ${title} online gratis en HD - VIVOTV`;
        card.innerHTML = `
            ${rank ? `<div class="rank-number">${rank}</div>` : ''}
            <div class="movie-card-inner">
                <img src="${posterImg}" alt="${altText}" loading="lazy" 
                     onerror="if(window.reportMaintenanceId){ 
                        const id = this.closest('.movie-card').dataset.tmdbId;
                        this.closest('.movie-card').classList.add('in-maintenance');
                        this.closest('.movie-card').classList.remove('is-available');
                        const b = this.closest('.movie-card').querySelector('.badge-container');
                        if(b) b.innerHTML = '<div class=\'maintenance-badge\'>EN MANTENIMIENTO</div>';
                        window.reportMaintenanceId(id);
                        this.src='https://images.weserv.nl/?url=ssl:placehold.jp/24/2a1b5e/ffffff/300x450.png?text=VIVO+TV+MANTENIMIENTO';
                     }">
                <div class="movie-card-title">${title}</div>
                <div class="badge-container">
                    ${isMaintenance ? `
                        <div class="maintenance-badge">EN MANTENIMIENTO</div>
                    ` : `
                        <div class="watched-badge watched-premium ${isWatched ? '' : 'hidden'}">
                            <svg viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                            VISTO
                        </div>
                        ${!isWatched ? (isAvailable ? `
                            <div class="available-badge">
                                <svg viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 
                                DISPONIBLE
                            </div>` : `
                            <div class="coming-soon-badge">PRÓXIMAMENTE</div>`) : ''}
                    `}
                </div>
                ${(progress !== null && progress > 0) && !isWatched ? `
                    <div class="card-progress-bar">
                        <div class="card-progress-fill" style="width: ${progress}%"></div>
                    </div>
                ` : ''}
                
                <!-- Netflix-style Hover Info -->
                <div class="movie-info-mini">
                    <div class="mini-title">${title}</div>
                    <div class="mini-meta">
                        <span class="match">${rating} Match</span>
                        <span class="year">${year}</span>
                        <span class="hd-label">HD</span>
                    </div>
                    <div class="mini-genres">${genresList}</div>
                </div>
            </div>
            <div class="movie-tooltip">
                <div class="movie-tooltip-actions">
                    <button class="movie-tooltip-btn btn-play" title="Reproducir">${isMaintenance ? '🔧' : '▶'}</button>
                    <button class="movie-tooltip-btn btn-outline-rnd btn-add-fav ${isFav ? 'added-to-list' : ''}" 
                            title="${isFav ? 'Eliminar de Mi Lista' : 'Añadir a Mi Lista'}"
                            onclick="event.stopPropagation(); window.VIVOTV_TOGGLE_FAVORITE('${id}', '${type}', this)">
                        ${isFav ? '✓' : '+'}
                    </button>
                </div>
                <div class="movie-tooltip-meta">
                    <span class="movie-tooltip-rating">${rating} Match</span>
                    <span class="movie-tooltip-year">${year}</span>
                    <span class="badge-hd">HD</span>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 8px;">${genresList}</div>
                ${isMaintenance ? '<div style="color:var(--primary); font-weight:bold; margin-top:5px; font-size:0.7rem;">ESTAMOS ARREGLANDO ESTE TÍTULO</div>' : ''}
            </div>`;

        const openDetail = () => {
            if (isMaintenance) {
                window.showToast('Este título está en mantenimiento técnico.', 'info');
                return;
            }
            window.dispatchEvent(
                new CustomEvent('open-movie-detail', { detail: { tmdbId: id, type } })
            );
        };

        card.addEventListener('click', openDetail);
        card.querySelector('.movie-tooltip-btn').addEventListener('click', (e) => { e.stopPropagation(); openDetail(); });

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

    renderTop10(containerId, results, availableIds) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        results.forEach((item, index) => {
            const isAvail = availableIds.has(item.id.toString());
            const type = item.media_type || (item.title ? 'movie' : 'tv');
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
    },

    async renderSimilar(id, type, availableIds) {
        let similarSection = document.getElementById('similarTitlesSection');
        if (!similarSection) {
            similarSection = document.createElement('section');
            similarSection.id = 'similarTitlesSection';
            similarSection.className = 'details-section';
            similarSection.innerHTML = `
                <h3 class="section-label">Títulos Similares</h3>
                <div class="similar-grid" id="similarGrid"></div>
            `;
            const mainCol = document.querySelector('.details-main-col');
            if (mainCol) mainCol.appendChild(similarSection);
        }

        const grid = document.getElementById('similarGrid');
        if (!grid) return;
        
        grid.innerHTML = '<div class="loader-wave"><span></span><span></span><span></span></div>';
        
        try {
            const data = await TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}/similar`);
            grid.innerHTML = '';
            
            const results = (data.results || []).slice(0, 12);
            if (results.length === 0) {
                similarSection.classList.add('hidden');
                return;
            }

            similarSection.classList.remove('hidden');
            results.forEach(item => {
                const isAvail = availableIds.has(item.id.toString()) || availableIds.has(item.id);
                const card = this.createMovieCard(item, type, isAvail);
                grid.appendChild(card);
            });
        } catch (e) { 
            console.error('Error similar titles:', e);
            similarSection.classList.add('hidden');
        }
    },

    // MODO TV BOX: Navegación por Teclado
    initTVNavigation() {
        document.addEventListener('keydown', (e) => {
            const active = document.activeElement;
            if (!active || !active.classList.contains('movie-card')) {
                if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                    const first = document.querySelector('.movie-card');
                    if (first) first.focus();
                }
                return;
            }

            const cards = Array.from(document.querySelectorAll('.movie-card'));
            const index = cards.indexOf(active);
            const rowWidth = 6; // Aproximado para grilla

            switch(e.key) {
                case 'ArrowRight': e.preventDefault(); if (index < cards.length - 1) cards[index + 1].focus(); break;
                case 'ArrowLeft': e.preventDefault(); if (index > 0) cards[index - 1].focus(); break;
                case 'ArrowDown': e.preventDefault(); if (index + rowWidth < cards.length) cards[index + rowWidth].focus(); break;
                case 'ArrowUp': e.preventDefault(); if (index - rowWidth >= 0) cards[index - rowWidth].focus(); break;
                case 'Enter': active.click(); break;
            }
        });
    },

    // INTERFAZ ADAPTATIVA: Colores Dinámicos
    async applyAdaptiveTheme(imageUrl) {
        if (!imageUrl) return;
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 1; canvas.height = 1;
            ctx.drawImage(img, 0, 0, 1, 1);
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
            document.documentElement.style.setProperty('--accent-dynamic', `rgb(${r}, ${g}, ${b})`);
            document.documentElement.style.setProperty('--accent-dynamic-glow', `rgba(${r}, ${g}, ${b}, 0.5)`);
        };
    }
};

/**
 * Efectos Globales de UI
 */
export const UI_EFFECTS = {
    initNavbarScroll() {
        const navbar = document.getElementById('navbar');
        if (!navbar) return;
        window.addEventListener('scroll', () => {
            const scrolled = window.scrollY > 100;
            navbar.classList.toggle('scrolled', scrolled);
            if (scrolled) {
                const opacity = Math.min(0.95, 0.4 + (window.scrollY - 100) / 800);
                navbar.style.background = `rgba(9, 9, 11, ${opacity})`;
            } else {
                navbar.style.background = '';
            }
        });
    },

    initMobileNavIndicator() {
        const nav = document.querySelector('.mobile-nav');
        const indicator = document.getElementById('navIndicator');
        const activeItem = document.querySelector('.mobile-nav-item.active');
        if (!nav || !indicator || !activeItem) return;
        setTimeout(() => {
            const navRect = nav.getBoundingClientRect();
            const activeRect = activeItem.getBoundingClientRect();
            const offsetLeft = activeRect.left - navRect.left;
            const itemWidth = activeRect.width;
            const indicatorWidth = 64; 
            indicator.style.left = `${offsetLeft + (itemWidth - indicatorWidth) / 2}px`;
            indicator.style.opacity = "1";
        }, 100);
    },

    setLoading(isLoading, btnText, btnLoader, btnSubmit) {
        if (btnText) btnText.classList.toggle('hidden', isLoading);
        if (btnLoader) btnLoader.classList.toggle('hidden', !isLoading);
        if (btnSubmit) btnSubmit.disabled = isLoading;
    }
};

// Iniciar componentes premium
CATALOG_UI.initTVNavigation();
