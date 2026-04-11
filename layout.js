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
        this.injectStyles();
        this.ensureNoCacheMeta();
        this.renderShell();
        this.setupNavigation();
        this.setupGlobalEvents();
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

    injectStyles() {
        if (document.getElementById('layout-styles')) return;
        const style = document.createElement('style');
        style.id = 'layout-styles';
        style.textContent = `
            .page-transition-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: #0b122b; z-index: 9999;
                opacity: 0; pointer-events: none; transition: opacity 0.075s ease-in-out;
            }
            .page-transition-overlay.active { opacity: 1; pointer-events: all; }
            
            /* Animación de entrada suave */
            body { opacity: 0; transition: opacity 0.15s ease; }
            body.loaded { opacity: 1; }
        `;
        document.head.appendChild(style);
    },

    /**
     * Renderiza la "Cáscara" de la aplicación (Navbar, Mobile Nav, Splash)
     */
    renderShell() {
        const body = document.body;
        
        // 1. Splash Screen si no existe
        if (!document.getElementById('splashScreen')) {
            const splash = document.createElement('div');
            splash.id = 'splashScreen';
            splash.className = 'splash-screen';
            splash.innerHTML = `
                <div class="splash-logo">VIVO<span>TV</span></div>
                <div class="splash-bars"><div></div><div></div><div></div><div></div><div></div></div>
            `;
            // Insertar splash sin romper el DOM del formulario auth
            const authSectionRef = document.getElementById('authSection');
            if (authSectionRef) {
                body.insertBefore(splash, authSectionRef);
            } else {
                body.prepend(splash);
            }
        }

        // 2. Navbar si no existe
        if (!document.getElementById('navbar')) {
            const path = window.location.pathname;
            const isAuthPage = path.endsWith('index.html') || path.endsWith('registro.html') || path === '/' || path.endsWith('vivoweb/');
            const isSearchPage = path.includes('busqueda.html');
            const showSearch = !isAuthPage || isSearchPage;

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
                    <a href="milista.html" id="linkMyList">Mi Lista</a>
                </nav>
                <div class="user-actions">
                    <div class="search-box ${showSearch ? '' : 'hidden'}" id="searchBox">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                        <input type="text" id="searchInput" placeholder="Buscar títulos...">
                        <button class="btn-clear-search hidden" id="btnClearSearch">&times;</button>
                    </div>
                    <div id="userProfile" class="hidden user-profile-btn">
                        <div class="avatar" id="userAvatar">U</div>
                        <span id="userName">Usuario</span>
                    </div>
                </div>
            `;
            // En páginas de auth (index.html, registro.html), insertar ANTES del authSection
            // para no romper el árbol DOM del formulario
            const authSection = document.getElementById('authSection');
            if (authSection) {
                body.insertBefore(header, authSection);
            } else {
                body.insertBefore(header, body.firstChild);
            }
        }

        // 3. Mobile Nav (Tab Bar Estilo iPhone)
        if (!document.querySelector('.mobile-nav')) {
            const mNav = document.createElement('nav');
            mNav.className = 'mobile-nav';
            mNav.innerHTML = `
                <div class="mobile-nav-indicator" id="navIndicator"></div>
                <a href="index.html" class="mobile-nav-item" id="mNavInicio">
                    <svg viewBox="0 0 24 24" width="24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                    <span>Inicio</span>
                </a>
                <a href="peliculas.html" class="mobile-nav-item" id="mNavPeliculas">
                    <svg viewBox="0 0 24 24" width="24"><path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/></svg>
                    <span>Cine</span>
                </a>
                <a href="series.html" class="mobile-nav-item" id="mNavSeries">
                    <svg viewBox="0 0 24 24" width="24"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>
                    <span>Series</span>
                </a>
                <a href="live.html" class="mobile-nav-item" id="mNavLive">
                    <svg viewBox="0 0 24 24" width="24"><path d="M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2zm0 14H3V8h18v12zM9 10v8l7-4z"/></svg>
                    <span>Vivo</span>
                </a>
                <a href="milista.html" class="mobile-nav-item" id="mNavLista">
                    <svg viewBox="0 0 24 24" width="24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
                    <span>Mi Lista</span>
                </a>
            `;
            body.appendChild(mNav);
        }

        // Modal de Salida (Híbrido) — solo en páginas que NO son auth
        const isAuthPage = window.location.pathname.endsWith('index.html') || 
                           window.location.pathname.endsWith('registro.html') ||
                           window.location.pathname === '/';
        if (!document.getElementById('exitModal') && !isAuthPage) {
            const exit = document.createElement('div');
            exit.id = 'exitModal';
            exit.className = 'exit-modal-overlay hidden';
            exit.innerHTML = `
                <div class="exit-modal-content">
                    <h2 class="exit-modal-title">¿A dónde quieres ir?</h2>
                    <p class="exit-modal-text">Selecciona una opción para continuar.</p>
                    <div class="exit-modal-actions">
                        <button class="exit-modal-btn btn-change-profile" id="btnSwitchProfile">Elegir otro perfil</button>
                        <button class="exit-modal-btn btn-logout-final" id="btnLogoutConfirm">Cerrar sesión de la cuenta</button>
                        <button class="exit-modal-btn btn-cancel-exit" id="btnCancelExit">Volver</button>
                    </div>
                </div>
            `;
            body.appendChild(exit);
        }

        // Toast Notification System
        if (!document.getElementById('toast')) {
            const toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast hidden';
            body.appendChild(toast);
        }

        // Overlay de transición
        const trans = document.createElement('div');
        trans.id = 'pageTransitionOverlay';
        trans.className = 'page-transition-overlay';
        body.appendChild(trans);
        
        // Marcar como cargado para animaciones iniciales
        setTimeout(() => body.classList.add('loaded'), 100);
    },

    /**
     * Maneja el resaltado de links activos y la navegación "Instant"
     */
    setupNavigation() {
        const path = window.location.pathname;
        const links = document.querySelectorAll('nav a, .mobile-nav a');
        
        links.forEach(link => {
            const isHome = path === '/' || path.includes('index.html');
            const href = link.getAttribute('href');
            
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

                // 3. Actualizar History API
                if (pushState) {
                    window.history.pushState({ url }, doc.title, url);
                }

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
