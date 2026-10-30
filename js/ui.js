import { CONFIG } from './config.js';
import { TMDB_SERVICE } from './tmdb.js';

window.failedIds = window.failedIds || new Set(JSON.parse(localStorage.getItem('vivotv_failed_ids') || '[]'));

window.addEventListener('update-ui-availability', () => {
    window.failedIds = new Set(JSON.parse(localStorage.getItem('vivotv_failed_ids') || '[]'));
    const cards = document.querySelectorAll('.movie-card');
    cards.forEach(card => {
        const id = card.dataset.tmdbId;
        if (!id) return;
        const isMaintenance = (window.maintenanceIds || new Set()).has(id);
        const isFailed = window.failedIds.has(id);
        const isDbAvailable = card.dataset.dbAvailable === 'true';
        const isActuallyAvailable = isDbAvailable || (!isFailed && !isMaintenance);

        card.classList.toggle('is-available', isActuallyAvailable && !isMaintenance);
        card.classList.toggle('in-maintenance', isMaintenance);

        const badgeContainer = card.querySelector('.badge-container');
        if (badgeContainer) {
            if (isMaintenance) {
                badgeContainer.innerHTML = '<div class="maintenance-badge">EN MANTENIMIENTO</div>';
            } else {
                const watchedBadge = card.querySelector('.watched-badge');
                const isWatched = watchedBadge && !watchedBadge.classList.contains('hidden');
                badgeContainer.innerHTML = `
                    <div class="watched-badge watched-premium ${isWatched ? '' : 'hidden'}">
                        <svg viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                        VISTO
                    </div>
                    ${!isWatched ? (isActuallyAvailable ? `
                        <div class="available-badge">
                            ${card.classList.contains('ranked') ? '' : '<svg viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'} 
                            ${card.classList.contains('ranked') ? 'RECIÉN AGREGADO' : 'DISPONIBLE'}
                        </div>
                    ` : `
                        <div class="coming-soon-badge">PRÓXIMAMENTE</div>
                    `) : ''}
                `;
            }
        }
    });
});

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
                img.onerror = () => {
                    heroBanner.style.backgroundImage = 'radial-gradient(ellipse at 70% 25%, rgba(157, 78, 221, 0.42) 0%, rgba(19, 26, 51, 0.88) 55%, #060912 100%)';
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
            const maturityEl = document.getElementById('heroMaturity');
            if (maturityEl) maturityEl.textContent = movie.adult ? '18+' : '16+';
            
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

    setupRowPaginationAndArrows(container) {
        if (!container) return;
        const section = container.closest('.catalog-row');
        const header = section?.querySelector('.row-header');
        const wrapper = container.closest('.carousel-wrapper');

        if (header) {
            let pag = header.querySelector('.row-pagination');
            if (!pag) {
                pag = document.createElement('div');
                pag.className = 'row-pagination';
                header.appendChild(pag);
            }
            const totalItems = container.children.length;
            const pageCount = Math.max(2, Math.min(6, Math.ceil(totalItems / 5)));
            pag.innerHTML = Array.from({ length: pageCount }, (_, i) =>
                `<span class="row-pagination-dash${i === 0 ? ' active' : ''}"></span>`
            ).join('');

            const updateDashes = () => {
                const maxScroll = Math.max(1, container.scrollWidth - container.clientWidth);
                const ratio = Math.min(1, Math.max(0, container.scrollLeft / maxScroll));
                const activeIdx = Math.min(pageCount - 1, Math.round(ratio * (pageCount - 1)));
                pag.querySelectorAll('.row-pagination-dash').forEach((d, idx) => {
                    d.classList.toggle('active', idx === activeIdx);
                });
            };

            if (!container.dataset.pagBound) {
                container.addEventListener('scroll', updateDashes, { passive: true });
                container.dataset.pagBound = 'true';
            }
        }

        if (wrapper && !wrapper.dataset.arrowsBound) {
            const leftBtn = wrapper.querySelector('.carousel-arrow-left');
            const rightBtn = wrapper.querySelector('.carousel-arrow-right');
            if (leftBtn) {
                leftBtn.onclick = (e) => {
                    e.stopPropagation();
                    container.scrollBy({ left: -Math.round(container.clientWidth * 0.9), behavior: 'smooth' });
                };
            }
            if (rightBtn) {
                rightBtn.onclick = (e) => {
                    e.stopPropagation();
                    container.scrollBy({ left: Math.round(container.clientWidth * 0.9), behavior: 'smooth' });
                };
            }
            wrapper.dataset.arrowsBound = 'true';
        }
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
        
        const isRankedSection = containerId === 'trendingCarousel';
        
        items.forEach((item, index) => {
            if (!item.poster_path && !item.poster_url && !item.backdrop_path && !item.backdrop_url) return;
            const type = typeOverride || item.content_type || item.media_type || (containerId.toLowerCase().includes('tv') ? 'tv' : 'movie');
            const id = item.id || item.tmdb_id;
            const isAvail = id ? _ids.has(id.toString()) : false;
            
            // Pasar el rank solo si es la sección de tendencias
            const rank = isRankedSection ? (index + 1) : null;
            const card = this.createMovieCard(item, type, isAvail, rank);
            fragment.appendChild(card);
        });
        container.appendChild(fragment);
        this.setupRowPaginationAndArrows(container);
    },

    createMovieCard(item, type, isAvailable = false, rank = null, progress = null) {
        const id = (item.id || item.tmdb_id)?.toString();
        const maintenanceIds = window.maintenanceIds || new Set();
        const isMaintenance = maintenanceIds.has(id);
        const failedIds = window.failedIds || new Set();
        const isFailed = failedIds.has(id);
        const isActuallyAvailable = isAvailable || (!isFailed && !isMaintenance);
        
        const card = document.createElement('div');
        card.className = `movie-card${isActuallyAvailable && !isMaintenance ? ' is-available' : ''}${isMaintenance ? ' in-maintenance' : ''}${rank ? ' ranked' : ''}`;
        card.dataset.tmdbId = id;
        card.dataset.type = type || item.content_type || item.media_type;
        card.dataset.dbAvailable = isAvailable ? 'true' : 'false';
        card.tabIndex = 0;

        // Extraer y asignar IDs de géneros para el filtrado en cliente
        const genresArr = item.genres || item.genre_ids || [];
        let genreIds = [];
        if (Array.isArray(genresArr)) {
            genreIds = genresArr.map(g => typeof g === 'object' ? g.id : g).filter(Boolean);
        } else if (typeof genresArr === 'string') {
            genreIds = genresArr.split(',').map(g => parseInt(g.trim())).filter(Boolean);
        }
        card.dataset.genres = genreIds.join(',');

        const year   = (item.release_date || item.first_air_date || '').split('-')[0];
        const rating = item.vote_average ? item.vote_average.toFixed(1) : (item.rating || '9.5');
        const matchPct = Math.min(99, Math.max(78, Math.round(parseFloat(rating) * 10)));
        const rawTitle = item.title || item.name || 'VivoTV';
        const title  = rawTitle.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

        const posterImg = item.poster_url || (item.poster_path ? `${CONFIG.TMDB_IMAGE_CARD}${item.poster_path}` : 'assets/no-poster.png');
        const backdropImg = item.backdrop_url || (item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : posterImg);
        const genresList = (item.genre_ids || []).slice(0, 3).map(gid => this.getGenreName(gid)).filter(Boolean).join(' • ') || (type === 'tv' ? 'Serie de TV' : 'Película');
        const isWatched = progress && progress >= 95;

        const isFav = window.VIVOTV_FAVORITES?.has(id);
        const altText = `Ver ${type === 'tv' ? 'serie' : 'película'} ${title} online gratis en HD - VIVOTV`;

        const mediaMarkup = rank
            ? `<img src="${posterImg}" alt="${altText}" loading="lazy">`
            : `<picture>
                   <source media="(min-width: 741px)" srcset="${backdropImg}">
                   <img src="${posterImg}" alt="${altText}" loading="lazy">
               </picture>
               <div class="card-backdrop-title">${title}</div>`;

        card.innerHTML = `
            ${rank ? `<div class="rank-number">${rank}</div>` : ''}
            <div class="movie-card-inner">
                ${mediaMarkup}
                <div class="movie-card-title">${title}</div>
                <div class="badge-container">
                    ${isMaintenance ? `
                        <div class="maintenance-badge">EN MANTENIMIENTO</div>
                    ` : `
                        <div class="watched-badge watched-premium ${isWatched ? '' : 'hidden'}">
                            <svg viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                            VISTO
                        </div>
                        ${!isWatched ? (isActuallyAvailable ? `
                            <div class="available-badge">
                                ${rank ? '' : '<svg viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'} 
                                ${rank ? 'RECIÉN AGREGADO' : 'DISPONIBLE'}
                            </div>` : `
                            <div class="coming-soon-badge">PRÓXIMAMENTE</div>`) : ''}
                    `}
                </div>
                ${(progress !== null && progress > 0) && !isWatched ? `
                    <div class="card-progress-bar">
                        <div class="card-progress-fill" style="width: ${progress}%"></div>
                    </div>
                ` : ''}
            </div>
            <!-- Netflix-style Hover Info Drawer (Direct child of .movie-card so it is never clipped) -->
            <div class="movie-info-mini">
                <div class="mini-title">${title}</div>
                <div class="mini-actions">
                    <button class="mini-btn btn-mini btn-play" title="Reproducir">${isMaintenance ? '🔧' : '▶'}</button>
                    <button class="mini-btn btn-mini btn-add-fav ${isFav ? 'added-to-list' : ''}" title="Mi Lista">
                        ${isFav ? '✓' : '+'}
                    </button>
                    <button class="mini-btn btn-mini btn-like" title="Me gusta">👍</button>
                    <button class="mini-btn btn-mini btn-more-info" title="Más información">⌄</button>
                </div>
                <div class="mini-meta">
                    <span class="match">${matchPct}% para ti</span>
                    <span class="age-badge">16+</span>
                    <span class="year">${year}</span>
                    <span class="hd-label">HD</span>
                </div>
                <div class="mini-genres">${genresList}</div>
            </div>`;

        const imgEl = card.querySelector('img');
        if (imgEl) {
            imgEl.addEventListener('error', () => {
                if (imgEl.dataset.fallbackApplied) return;
                imgEl.dataset.fallbackApplied = 'true';
                const cleanT = rawTitle.replace(/[&<>'"]/g, '').slice(0, 20);
                const fallbackSvg = `data:image/svg+xml;charset=UTF-8,` + encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">` +
                    `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">` +
                    `<stop offset="0%" stop-color="#131a33"/><stop offset="60%" stop-color="#2a1b5e"/><stop offset="100%" stop-color="#060912"/>` +
                    `</linearGradient></defs>` +
                    `<rect width="100%" height="100%" fill="url(#g)"/>` +
                    `<text x="50%" y="175" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-weight="800" font-size="24">${cleanT}</text>` +
                    `<text x="50%" y="210" text-anchor="middle" fill="#bb86fc" font-family="sans-serif" font-weight="700" font-size="15">VIVOTV</text>` +
                    `</svg>`
                );
                const srcEl = card.querySelector('source');
                if (srcEl) srcEl.srcset = fallbackSvg;
                imgEl.src = fallbackSvg;
            }, { once: true });
        }

        const openDetail = () => {
            if (isMaintenance) {
                window.showToast('Este título está en mantenimiento técnico.', 'info');
                return;
            }
            window.dispatchEvent(
                new CustomEvent('open-movie-detail', { detail: { tmdbId: id, type } })
            );
        };

        // Prefetch inteligente tipo SPA (Netflix / Disney+) en hover/focus
        let prefetchTimer = null;
        card.addEventListener('mouseenter', () => {
            prefetchTimer = setTimeout(() => {
                if (window.TMDB_SERVICE && typeof window.TMDB_SERVICE.getDetails === 'function') {
                    window.TMDB_SERVICE.getDetails(id, type).catch(() => {});
                }
            }, 120);
        });
        card.addEventListener('mouseleave', () => {
            if (prefetchTimer) clearTimeout(prefetchTimer);
        });

        card.addEventListener('click', openDetail);
        const favBtn = card.querySelector('.btn-add-fav');
        if (favBtn) {
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.VIVOTV_TOGGLE_FAVORITE) {
                    window.VIVOTV_TOGGLE_FAVORITE(id, type, favBtn);
                }
            });
        }
        const likeBtn = card.querySelector('.btn-like');
        if (likeBtn) {
            likeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                likeBtn.classList.toggle('liked');
            });
        }
        const moreInfoBtn = card.querySelector('.btn-more-info');
        if (moreInfoBtn) {
            moreInfoBtn.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                openDetail(); 
            });
        }

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
        const _ids = (availableIds instanceof Set) ? availableIds : (window.availableIds || new Set());

        results.forEach((item, index) => {
            const id = item.id || item.tmdb_id;
            const isAvail = id ? _ids.has(id.toString()) : false;
            const type = item.media_type || item.content_type || (item.title ? 'movie' : 'tv');
            
            // Invocar createMovieCard con el rango del ranking (index + 1) para activar .ranked y .rank-number
            const card = this.createMovieCard(item, type, isAvail, index + 1);
            fragment.appendChild(card);
        });
        container.appendChild(fragment);
        this.setupRowPaginationAndArrows(container);
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
            
            const results = (data.results || []).slice(0, 9);
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
            const scrolled = window.scrollY > 15;
            navbar.classList.toggle('scrolled', scrolled);
            navbar.style.background = '';
        }, { passive: true });
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
