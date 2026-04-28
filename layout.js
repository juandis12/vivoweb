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
