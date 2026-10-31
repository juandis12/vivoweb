import './update-notifier.js';
/**
 * VivoWeb Layout Engine v3.0 (SPA-Hybrid)
 * Este módulo centraliza todos los componentes comunes de la UI y maneja
 * la persistencia visual entre cambios de página.
 */

export const LAYOUT = {
    /**
     * Inyecta los componentes base en el DOM.
     * Se debe llamar al inicio de cada página.
     */
    init() {
        this.ensureNoCacheMeta();
        this.ensureNetflixLayoutStylesheet();
        this.renderShell();
        this.setupNavigation();
        this.setupGlobalEvents();
        const navEl = document.getElementById('navbar');
        if (navEl) {
            const hasHero = !!document.querySelector('.hero-banner, #heroBanner');
            navEl.classList.toggle('no-hero', !hasHero);
        }
    },

    ensureNoCacheMeta() {
        const tags = [
            { 'http-equiv': 'Cache-Control', content: 'no-cache, no-store, must-revalidate' },
            { 'http-equiv': 'Pragma', content: 'no-cache' },
            { 'http-equiv': 'Expires', content: '0' }
        ];
        tags.forEach(attrs => {
            const existing = document.head.querySelector(`meta[http-equiv="${attrs['http-equiv']}"]`);
            if (existing) return;
            const meta = document.createElement('meta');
            Object.entries(attrs).forEach(([key, value]) => meta.setAttribute(key, value));
            document.head.appendChild(meta);
        });
    },

    ensureNetflixLayoutStylesheet() {
        if (!document.head.querySelector('link[href*="netflix-layout.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = './netflix-layout.css?v=1.0.0';
            document.head.appendChild(link);
        }
    },

    /**
     * Renderiza la "Cáscara" de la aplicación (Navbar, Mobile Nav, Splash)
     */
    renderShell() {
        const body = document.body;
        
        // 1. Overlay de transición (Crítico para SPA)
        if (!document.getElementById('pageTransitionOverlay')) {
            const trans = document.createElement('div');
            trans.id = 'pageTransitionOverlay';
            trans.className = 'page-transition-overlay';
            body.appendChild(trans);
        }

        // 2. Inyectar Navbar si falta (Para navegación directa a subpáginas)
        if (!document.getElementById('navbar') && !body.classList.contains('page-auth')) {
            const header = document.createElement('header');
            header.className = 'navbar';
            header.id = 'navbar';
            header.innerHTML = `
                <div class="logo" onclick="window.location.href='index.html'" style="cursor:pointer">VIVO<span>TV</span></div>
                <nav id="mainNav" class="hidden">
                    <a href="index.html" id="navInicio">Inicio</a>
                    <a href="peliculas.html" id="navPeliculas">Películas</a>
                    <a href="series.html" id="navSeries">Series</a>
                    <a href="anime.html" id="navAnime">Anime</a>
                    <a href="live.html" id="navLive">En Vivo</a>
                    <a href="#" id="btnSurprise" class="btn-surprise-nav">✨ Sorpréndeme</a>
                    <a href="milista.html" id="linkMyList">Mi Lista</a>
                </nav>
                <div class="user-actions">
                    <div class="search-box hidden" id="searchBox">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                        </svg>
                        <input type="text" id="searchInput" placeholder="Títulos, géneros...">
                        <button class="btn-clear-search hidden" id="btnClearSearch">&times;</button>
                    </div>
                    <div id="userProfile" class="hidden user-profile-btn">
                        <div class="avatar" id="userAvatar">U</div>
                        <span id="userName">Usuario</span>
                    </div>
                </div>
            `;
            body.prepend(header);
        }

        // 2b. Asegurar etiqueta de clasificación (16+) en el Hero y píldoras móviles estilo Netflix
        this.augmentHeroAndMobilePills();

        // 3. Inyectar Mobile Nav si falta
        if (!document.querySelector('.mobile-nav') && !body.classList.contains('page-auth')) {
            const mobNav = document.createElement('nav');
            mobNav.className = 'mobile-nav hidden';
            mobNav.innerHTML = `
                <div class="mobile-nav-indicator" id="navIndicator"></div>
                <a href="index.html" class="mobile-nav-item" id="mNavInicio">
                    <svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                    <span>Inicio</span>
                </a>
                <a href="peliculas.html" class="mobile-nav-item" id="mNavPeliculas">
                    <svg viewBox="0 0 24 24"><path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/></svg>
                    <span>Cine</span>
                </a>
                <a href="series.html" class="mobile-nav-item" id="mNavSeries">
                    <svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>
                    <span>Series</span>
                </a>
                <a href="anime.html" class="mobile-nav-item" id="mNavAnime">
                    <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
                    <span>Anime</span>
                </a>
                <a href="live.html" class="mobile-nav-item" id="mNavLive">
                    <svg viewBox="0 0 24 24"><path d="M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2zm0 14H3V8h18v12zM9 10v8l7-4z"/></svg>
                    <span>Vivo</span>
                </a>
                <a href="milista.html" class="mobile-nav-item" id="mNavLista">
                    <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    <span>Mi Lista</span>
                </a>
            `;
            body.appendChild(mobNav);
        }

        // 4. Inyectar Modal de Cuenta & Perfil si falta en la página
        if (!document.getElementById('exitModal') && !body.classList.contains('page-auth')) {
            const exitModal = document.createElement('div');
            exitModal.id = 'exitModal';
            exitModal.className = 'exit-modal-overlay hidden';
            exitModal.innerHTML = `
                <div class="exit-modal-content">
                    <h2 class="exit-modal-title">Mi Cuenta y Perfil</h2>
                    <p class="exit-modal-text">Gestiona tus preferencias, logros y sesión.</p>
                    <div class="exit-modal-actions">
                        <button class="exit-modal-btn" id="btnOpenAchievements" style="background: rgba(187,134,252,0.15); border: 1px solid rgba(187,134,252,0.3); color: #fff;">🏆 Mis Logros (XP &amp; Niveles)</button>
                        <button class="exit-modal-btn" id="btnOpenVibeDiscovery" style="background: rgba(0,210,255,0.12); border: 1px solid rgba(0,210,255,0.3); color: #fff;">🎭 Descubrir por Vibras</button>
                        <button class="exit-modal-btn btn-change-profile" id="btnSwitchProfile">Elegir otro perfil</button>
                        <button class="exit-modal-btn btn-logout-final" id="btnLogoutConfirm">Cerrar sesión de la cuenta</button>
                        <button class="exit-modal-btn btn-cancel-exit" id="btnCancelExit">Volver</button>
                    </div>
                </div>
            `;
            body.appendChild(exitModal);
        }
        
        // Marcar como cargado para animaciones iniciales
        setTimeout(() => body.classList.add('loaded'), 100);
    },

    augmentHeroAndMobilePills() {
        const heroBanner = document.getElementById('heroBanner');
        if (heroBanner && !document.getElementById('heroMaturity')) {
            const mat = document.createElement('div');
            mat.className = 'hero-maturity-tag';
            mat.id = 'heroMaturity';
            mat.textContent = '16+';
            heroBanner.appendChild(mat);
        }

        if (heroBanner && !document.getElementById('mobileCategoryPills')) {
            const pills = document.createElement('div');
            pills.className = 'mobile-category-pills';
            pills.id = 'mobileCategoryPills';
            const path = window.location.pathname;
            pills.innerHTML = `
                <a href="series.html" class="mobile-category-pill${path.includes('series.html') ? ' active' : ''}">Series</a>
                <a href="peliculas.html" class="mobile-category-pill${path.includes('peliculas.html') ? ' active' : ''}">Películas</a>
                <a href="anime.html" class="mobile-category-pill${path.includes('anime.html') ? ' active' : ''}">Anime</a>
                <a href="milista.html" class="mobile-category-pill${path.includes('milista.html') ? ' active' : ''}">Mi Lista</a>
            `;
            heroBanner.parentNode.insertBefore(pills, heroBanner);
        }
    },

    /**
     * Maneja el resaltado de links activos y la navegación "Instant"
     */
    setupNavigation() {
        const path = window.location.pathname;
        const links = document.querySelectorAll('nav a, .mobile-nav a, .mobile-category-pills a');
        
        links.forEach(link => {
            const isHome = path === '/' || path.includes('index.html');
            const href = link.getAttribute('href');
            if (!href || href === '#') return;
            
            link.classList.remove('active');
            if ((isHome && href === 'index.html') || path.includes(href)) {
                link.classList.add('active');
            }

            // Prefetch Inteligente
            link.addEventListener('mouseenter', () => {
                const prefetchTag = document.createElement('link');
                prefetchTag.rel = 'prefetch';
                prefetchTag.href = link.href;
                document.head.appendChild(prefetchTag);
            }, { once: true });

            // MEJORA: NAVEGACIÓN CINEMÁTICA (SPA)
            link.onclick = (e) => {
                const target = link.href;
                if (link.hostname === window.location.hostname && !target.includes('#')) {
                    e.preventDefault();
                    this.navigateTo(target);
                }
            };
        });
    },

    async navigateTo(url, pushState = true) {
        if (url === window.location.href && pushState) return;
        
        const overlay = document.getElementById('pageTransitionOverlay');
        overlay.classList.add('active');
        
        try {
            // 1. Iniciar la carga con cache: 'no-store' para forzar datos frescos (Fix Alt+F5)
            const fetchPromise = fetch(url, { cache: 'no-store' }).then(r => r.text());
            
            // Esperar los 75ms del fade-out antes de hacer el swap
            await new Promise(r => setTimeout(r, 75));

            const html = await fetchPromise;
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // 2. Extraer el contenido del contenedor principal y el <title>
            // MEJORA: Buscar primero por ID específico para evitar colisiones con múltiples <main>
            const newMain = doc.querySelector('#dashboardSection') || doc.querySelector('main');
            const currentMain = document.querySelector('#dashboardSection') || document.querySelector('main');
            
            if (newMain && currentMain) {
                // Preservar scroll top para la nueva página
                window.scrollTo(0, 0);
                currentMain.innerHTML = newMain.innerHTML;
                document.title = doc.title;

                // Sincronizar clases del body (Fase SPA: Consistencia)
                document.body.className = doc.body.className;
                // Asegurarse de mantener 'loaded' para no romper transiciones
                document.body.classList.add('loaded');
                if (newMain.className) {
                    currentMain.className = newMain.className;
                }
                const navEl = document.getElementById('navbar');
                if (navEl) {
                    const hasHero = !!(currentMain.querySelector('.hero-banner, #heroBanner') || doc.querySelector('.hero-banner, #heroBanner'));
                    navEl.classList.toggle('no-hero', !hasHero);
                }

                // 3. Actualizar History API
                if (pushState) {
                    window.history.pushState({ url }, doc.title, url);
                }

                this.augmentHeroAndMobilePills();

                // 4. Actualizar links activos
                this.setupNavigation();
                
                // 5. Emitir evento para que app.js se re-inicialice
                window.dispatchEvent(new CustomEvent('vivotv:page-changed', { detail: { url } }));
            }

        } catch (e) {
            console.error('Error en navegación SPA, redirigiendo a la antigua:', e);
            window.location.href = url;
        } finally {
            // 6. Fade-in final (75ms más)
            setTimeout(() => {
                overlay.classList.remove('active');
            }, 75);
        }
    },

    setupGlobalEvents() {
        // Escuchar botón Atrás/Adelante del navegador
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.url) {
                this.navigateTo(e.state.url, false);
            } else {
                location.reload(); // Fallback si no hay estado
            }
        });

        // Feedback háptico
        if ('vibrate' in navigator) {
            document.addEventListener('touchstart', (e) => {
                if (e.target.closest('.mobile-nav-item, .btn-primary, .avatar')) {
                    navigator.vibrate(10);
                }
            }, { passive: true });
        }
    }
};

// Auto-inicialización segura
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LAYOUT.init());
} else {
    LAYOUT.init();
}
