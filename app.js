import { CONFIG, supabase } from './config.js';
import { TMDB_SERVICE } from './tmdb.js';
import { CATALOG_UI } from './ui.js';
import { PLAYER_LOGIC, setSupabase } from './player.js';
import { showToast } from './utils.js';
import { 
    fetchAvailableIds as syncCatalog, 
    availableIds,
    availableMovies, 
    availableSeries,
    renderDBCatalog,
    renderHybridRow,
    validateContentType,
    filterItemsByProfile,
    validateBatchAvailability,
    DB_CATALOG,
    loadGridData
} from './catalog.js';

import { 
    initAuth, 
    startHeartbeat, 
    stopHeartbeat, 
    checkConcurrentSessions, 
    setCurrentProfile 
} from './auth.js';

// Usar instancia única centralizada
if (supabase) {
    setSupabase(supabase);
}

// ---- FUNCIONES DE DEBUG ----
function fatalLog(msg) {
    console.error(`💥 ${msg}`);
}

// Simple debug logger used throughout the app
function logDebug(msg) {
    console.debug(`[DEBUG] ${msg}`);
}

window.onerror = function(message, source, lineno, colno, error) {
    fatalLog(`${message} at ${lineno}:${colno}`);
};

window.addEventListener('unhandledrejection', function(event) {
    fatalLog(`Promise Rejection: ${event.reason}`);
});

// App cargada
console.log('App.js cargado correctamente.');

// ---- REFERENCIAS DOM ----
// Movidas dentro de initAppForPage() para evitar problemas entre páginas
let authSection, dashSection, loginForm, emailEl, usernameEl, passwordEl, btnSubmit, btnText, btnLoader, authError, toggleLink, userProfile, mainNav, mobileNav, btnLogout, userNameEl, userAvatar, searchBox, searchInput, btnClear, btnFav, btnPass, authTitle, authSubtitle, exitModal, btnSwitchProfile, btnLogoutConfirm, btnCancelExit;



let isLoginMode = !window.location.pathname.includes('registro.html');
let heroItems   = [];
let searchTimeout   = null;
let lastSearchResults = [];
let currentFilter     = 'all';
let pendingPartyId    = new URLSearchParams(window.location.search).get('party'); // FASE 4: Capturar invitación
window.VIVOTV_VIEWING_STATUS = null; 
let currentProfile = null;
let heartbeatTimer = null;
let isPopulating = false; // Guard para evitar sobre-población SPA

// El estado y validaciones ahora se importan de catalog.js para consistencia SPA
const getAvailableIds = () => window.availableIds || new Set();
const getDBCatalog    = () => window.DB_CATALOG || [];

let isDashboardInit = false;
let isAuthInitialized = false;

// ================================================
// INNOVACIÓN: UI INTERACTIVA
// ================================================
function initMagneticHover() {
    // 🚀 OPTIMIZACIÓN CINEMÁTICA: Removido el listener global de mousemove que bloqueaba la UI principal.
    // El hover ahora está manejado puramente a través de aceleración de hardware en CSS (transform: scale)
    // tal como recomienda la arquitectura React de Netflix. Cero pérdida energética.
}

function initNavbarScroll() {
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
}

// ================================================
// UI: NAVEGACIÓN MÓVIL (LÍQUIDO IPHONE)
// ================================================
function initMobileNavIndicator() {
    const nav = document.querySelector('.mobile-nav');
    const indicator = document.getElementById('navIndicator');
    const activeItem = document.querySelector('.mobile-nav-item.active');

    if (!nav || !indicator || !activeItem) return;

    // Pequeño delay para asegurar que el layout esté listo (especialmente en móviles)
    setTimeout(() => {
        const navRect = nav.getBoundingClientRect();
        const activeRect = activeItem.getBoundingClientRect();

        const offsetLeft = activeRect.left - navRect.left;
        const itemWidth = activeRect.width;
        const indicatorWidth = 64; // Coincide con el CSS (.mobile-nav-indicator width)

        // Posicionamiento centrado bajo el icono
        indicator.style.left = `${offsetLeft + (itemWidth - indicatorWidth) / 2}px`;
        indicator.style.opacity = "1";
    }, 100);
}

function initMagicSlide() {
    const nav = document.querySelector('.mobile-nav');
    const indicator = document.getElementById('navIndicator');
    if (!nav || !indicator) return;

    let isDragging = false;
    let targetLink = null;
    let preloadedUrls = new Set();
    const navRect = nav.getBoundingClientRect();
    const items = Array.from(nav.querySelectorAll('.mobile-nav-item'));

    // Deshabilitar navegación por clic normal si se está arrastrando
    items.forEach(item => {
        item.addEventListener('click', (e) => {
            if (isDragging) e.preventDefault();
        });
    });

    nav.addEventListener('touchstart', (e) => {
        isDragging = true;
        indicator.classList.add('dragging');
        handleTouchMove(e); // Actualizar instantáneamente al toque
    }, { passive: true });

    nav.addEventListener('touchmove', handleTouchMove, { passive: true });

    nav.addEventListener('touchend', () => {
        isDragging = false;
        indicator.classList.remove('dragging');
        
        // Carga Zero-Latency: Si hay un objetivo válido y no estamos ya en él
        if (targetLink && !targetLink.classList.contains('active')) {
            // Dar un feedback visual ultra rápido antes de cambiar
            targetLink.classList.add('active'); 
            
            // SPA BRIDGE: Usar el motor de layout en lugar de recarga completa
            if (window.LAYOUT && typeof window.LAYOUT.navigateTo === 'function') {
                window.LAYOUT.navigateTo(targetLink.href);
            } else {
                window.location.href = targetLink.href;
            }
        } else {
            // Si soltó fuera o en el mismo, devolver a su lugar
            initMobileNavIndicator();
        }
    });

    function handleTouchMove(e) {
        if (!isDragging) return;
        const touch = e.touches[0];
        
        // Limitar el movimiento dentro de la barra
        let x = touch.clientX - navRect.left;
        x = Math.max(0, Math.min(x, navRect.width));

        // Encontrar elemento bajo el dedo (aproximado por columna)
        const colWidth = navRect.width / items.length;
        const index = Math.floor(x / colWidth);
        const closestItem = items[Math.min(index, items.length - 1)];

        if (closestItem) {
            targetLink = closestItem;
            
            // Imantar el centro del indicador al centro del icono
            const activeRect = closestItem.getBoundingClientRect();
            const offsetLeft = activeRect.left - navRect.left;
            const indicatorWidth = 64; 
            
            indicator.style.left = `${offsetLeft + (activeRect.width - indicatorWidth) / 2}px`;

            // Zero-Latency: Pre-cargar (Prefetching) la página objetivo en segundo plano
            const url = closestItem.href;
            if (url && !preloadedUrls.has(url) && !closestItem.classList.contains('active')) {
                preloadedUrls.add(url);
                const link = document.createElement('link');
                link.rel = 'prefetch';
                link.href = url;
                document.head.appendChild(link);
            }
        }
    }
}

// El motor de efectos se inicializa en initializeVivotvApp o bajo demanda
window.addEventListener('resize', initMobileNavIndicator);
window.addEventListener('orientationchange', () => setTimeout(initMobileNavIndicator, 200));

// NUEVO: La sincronización del catálogo ahora se maneja centralmente en catalog.js
async function fetchAvailableIds() {
    await syncCatalog(supabase);
}

let isAuthInitializing = false;
async function initializeVivotvApp() {
    // Protección global contra doble inicialización (Guerra de Instancias)
    if (window.VIVOTV_AUTH_INITIALIZED) return;
    if (isAuthInitializing) return;
    isAuthInitializing = true;
    
    console.log('[VivoTV] 🚀 Inicializando motor unificado...');
    
    // Configurar el listener de cambios
    const { user, profile: authProfile } = await initAuth((event, session, profile) => {
        // Solo reaccionar si ya terminó la carga inicial
        if (!window.VIVOTV_AUTH_INITIALIZED) return;

        console.log(`[VivoTV] 📡 Cambio de estado detectado: ${event}`);
        if (event === 'SIGNED_IN' && session) {
            toDashboard(session.user, profile);
        } else if (event === 'SIGNED_OUT') {
            toAuth();
        }
    });

    // Manejar estado inicial
    if (user) {
        console.log('[VivoTV] ✅ Sesión recuperada.');
        await toDashboard(user, authProfile);
    } else {
        console.log('[VivoTV] ℹ️ Sin sesión activa.');
        toAuth();
    }
    
    window.VIVOTV_AUTH_INITIALIZED = true;
    isAuthInitializing = false;

    // --- LISTENERS DE SINCRONIZACIÓN REALTIME (Fase Connect) ---
    _setupGlobalSyncListeners();
}

/**
 * CONFIGURACIÓN DE LISTENERS REALTIME PARA UI
 */
function _setupGlobalSyncListeners() {
    // 1. Handover: Continuar viendo desde otro dispositivo
    window.addEventListener('vivotv:handover', async (e) => {
        const { tmdb_id, progress, type } = e.detail;
        
        // Evitar notificar si ya estamos viendo ese mismo contenido
        if (window.VIVOTV_PLAYING_ID === tmdb_id.toString()) return;

        // Obtener detalles del contenido para el Toast
        const details = await TMDB_SERVICE.getDetails(tmdb_id, type || 'movie');
        const title = details.title || details.name || 'Contenido';

        showToast(`📲 Sigue viendo "${title}" en el segundo ${progress}`, 'info', {
            action: 'REANUDAR',
            onClick: () => {
                // Lógica para abrir el player en esa posición (implementada en ui.js/player.js)
                if (window.openPlayer) window.openPlayer(tmdb_id, type, progress);
            }
        });
    });

    // 2. Refresh de Favoritos
    window.addEventListener('vivotv:favs_updated', () => {
        // El catálogo ya se refresca internamente en catalog.js, 
        // pero aquí podemos actualizar UI específica si fuera necesario.
        console.log('[App] UI de favoritos sincronizada.');
    });
}

/**
 * POBLACIÓN DE CONTENIDO (Core SPA)
 * Se encarga de llenar la página actual con datos (Hero, Carruseles, Grillas)
 * Se llama en el login inicial y en cada cambio de página SPA posterior.
 */
async function populatePageContent() {
    updateProfileUI(); // Asegurar que el nombre/avatar aparezcan en la nueva sección
    
    if (!currentProfile || isPopulating) return;
    isPopulating = true;
    
    console.log('[SPA Engine] 🧬 Iniciando sincronización de base de datos...');
    
    try {
        // 1. Sincronizar catálogo de Supabase (CRÍTICO para todas las páginas, incluido Live)
        await syncCatalog(supabase); 

        // 2. Evitar poblar carruseles/hero si estamos en la sección En Vivo (tiene su propio controlador)
        if (document.body.classList.contains('page-live') || window.location.pathname.includes('live.html')) {
            console.log('[SPA Engine] 📺 Sección En Vivo detectada, sincronización completa. Cediendo control a live-ui.js.');
            return;
        }

        console.log('[SPA Engine] 🧬 Poblando UI de la página...');
    
        if (window.location.hash !== '#linkMyList') window.scrollTo(0, 0);

        // --- LIMPIEZA: Limpiar carouseles residuales ---
        const carouselIds = [
            'trendingCarousel', 'popularMoviesCarousel', 'topRatedCarousel', 'popularTVCarousel',
            'actionCarousel', 'comedyCarousel', 'dramaCarousel', 'horrorCarousel',
            'popularCarousel', 'genre1Carousel', 'genre2Carousel', 'genre3Carousel', 'genre4Carousel',
            'recommendedCarousel'
        ];
        carouselIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });

        // 3. Ocultar secciones antes de repoblar
        const allSections = ['trendingSection', 'popularSection', 'topRatedSection', 'actionSection', 'comedySection', 'horrorSection', 'scifiSection', 'recommendedSection', 'recentSection', 'myListSection', 'popularMoviesSection', 'popularTVSection'];
        allSections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        // 4. Mostrar skeletons
        carouselIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                CATALOG_UI.showSkeletons(id);
                const section = el.closest('.catalog-row');
                if (section && !['recentSection', 'recommendedSection', 'myListSection'].includes(section.id)) {
                    section.classList.remove('hidden');
                }
            }
        });

        const gridContainer = document.getElementById('gridContainer');
        if (gridContainer) gridContainer.innerHTML = '';

        // 5. Cargar historiales y filas personalizadas
        renderDBCategoryRows();
        loadPersonalizedRows();
        
        if (document.getElementById('favoritesGrid')) loadMyList();
        if (document.getElementById('searchResultsGrid')) initSearchPage();

        // 6. Detectar tipo de página
        const isMoviesPage = document.body.classList.contains('page-movies');
        const isSeriesPage = document.body.classList.contains('page-series');
        const isAnimePage  = document.body.classList.contains('page-anime');
        const pageType     = (isSeriesPage || isAnimePage) ? 'tv' : (isMoviesPage ? 'movie' : 'all');

        // 7. Cargar Hero
        let heroData;
        if (isAnimePage) {
            heroData = await TMDB_SERVICE.fetchFromTMDB('/discover/tv', { with_genres: 16, with_original_language: 'ja', sort_by: 'popularity.desc' });
        } else if (pageType === 'tv') {
            heroData = await TMDB_SERVICE.fetchFromTMDB('/trending/tv/day');
        } else if (pageType === 'movie') {
            heroData = await TMDB_SERVICE.fetchFromTMDB('/trending/movie/day');
        } else {
            heroData = await TMDB_SERVICE.getTrending();
        }

        let availableHeroItems = (heroData.results || []).filter(m => {
            if (!m.backdrop_path) return false;
            if (availableIds.size > 0 && !availableIds.has(m.id.toString())) return false;
            const itemType = m.media_type || (pageType === 'all' ? 'movie' : pageType);
            return validateContentType(m, itemType);
        });

        const localHeroItems = (window.DB_CATALOG || []).filter(item => {
            if (!item.backdrop_url) return false;
            const itemType = item.content_type === 'series' ? 'tv' : 'movie';
            return validateContentType(item, itemType);
        }).slice(0, 5);
        
        let combinedHero = [...localHeroItems, ...availableHeroItems];
        heroItems = filterItemsByProfile(combinedHero).slice(0, 10);
        
        if (heroItems.length && document.getElementById('heroBanner')) {
            CATALOG_UI.renderHero(heroItems[0], heroItems);
            startHeroRotation();
        }

        // 8. Cargar Filas Progresivas
        const renderRow = async (containerId, fetchFn, type) => {
            const el = document.getElementById(containerId);
            if (!el) return;
            const data = await fetchFn();
            let filtered = filterItemsByProfile(data.results || []).slice(0, 20);
            if (filtered.length > 0) {
                CATALOG_UI.renderCarousel(containerId, filtered, type, availableIds);
                const section = el.closest('.catalog-row');
                if (section) section.classList.remove('hidden');
            }
        };

        if (pageType === 'all') {
            await Promise.all([
                (async () => {
                    const data = await TMDB_SERVICE.getTrending();
                    let filtered = filterItemsByProfile(data.results || []);
                    CATALOG_UI.renderTop10('trendingCarousel', filtered.slice(0, 10), availableIds, window.DB_CATALOG);
                })(),
                loadRecommendedItems(),
                renderRow('actionCarousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/movie', { with_genres: 28 }), 'movie'),
                renderRow('comedyCarousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/movie', { with_genres: 35 }), 'movie'),
                renderRow('horrorCarousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/movie', { with_genres: 27 }), 'movie'),
                renderRow('scifiCarousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/movie', { with_genres: 878 }), 'movie')
            ]);
        } else if (isAnimePage) {
            await renderAnimeDashboardRows(availableIds);
        } else {
            const fetchPopular = () => pageType === 'tv' 
                ? TMDB_SERVICE.fetchFromTMDB('/discover/tv', { without_genres: 16, sort_by: 'popularity.desc' }) 
                : TMDB_SERVICE.getPopularMovies();
            const fetchTop = () => pageType === 'tv' 
                ? TMDB_SERVICE.fetchFromTMDB('/tv/top_rated') 
                : TMDB_SERVICE.getTopRated();
            
            await Promise.all([
                renderRow('popularCarousel', fetchPopular, pageType),
                renderRow('topRatedCarousel', fetchTop, pageType),
                renderRow('genre1Carousel', () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { with_genres: pageType==='tv'?10759:28, ...(pageType==='tv'?{without_genres:16}:{}) }), pageType),
                renderRow('genre2Carousel', () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { with_genres: 35, ...(pageType==='tv'?{without_genres:16}:{}) }), pageType),
                renderRow('genre3Carousel', () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { with_genres: pageType==='tv'?18:10749, ...(pageType==='tv'?{without_genres:16}:{}) }), pageType),
                renderRow('genre4Carousel', () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { with_genres: pageType==='tv'?10765:27, ...(pageType==='tv'?{without_genres:16}:{}) }), pageType),
            ]);
        }
        
        // 9. Cargar Grilla (Biblioteca Completa)
        await loadGridData(pageType, 1, false, currentProfile);
        
        // 10. Configurar Botones "Ver más"
        setupVerMasButtons();
        
        await loadMyList();
        await loadRecentlyWatched();
    } catch (e) {
        console.error('[SPA Engine] Error poblando contenido:', e);
    } finally {
        isPopulating = false;
    }
}

/**
 * Sincroniza el nombre y avatar en el Navbar (Accesible globalmente)
 */
function updateProfileUI() {
    if (!currentProfile) {
        currentProfile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
    }
    if (!currentProfile) return;

    // Refrescar datos del perfil desde el storage periódicamente para asegurar el avatar más reciente
    const freshProfile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
    if (freshProfile) currentProfile = freshProfile;

    console.log(`[VivoTV] 👤 Actualizando UI para perfil: ${currentProfile.name}`);

    // Mostrar el contenedor y actualizar datos
    const profileContainer = document.getElementById('userProfile');
    const userNameElement = document.getElementById('userName');
    const userAvatarElement = document.getElementById('userAvatar');

    if (profileContainer) profileContainer.classList.remove('hidden');
    if (userNameElement) userNameElement.textContent = currentProfile.name;
    if (userAvatarElement) {
        if (currentProfile.avatar_url) {
            userAvatarElement.textContent = '';
            userAvatarElement.className = 'avatar';

            // Resolver URL para soporte cross-device
            let displayUrl = currentProfile.avatar_url;
            if (!displayUrl.startsWith('http') && !displayUrl.startsWith('assets/avatars/')) {
                displayUrl = `assets/avatars/${displayUrl}`;
            }

            userAvatarElement.style.backgroundImage = `url('${displayUrl}')`;
            userAvatarElement.style.backgroundSize = 'cover';
            userAvatarElement.style.backgroundPosition = 'center';
            userAvatarElement.style.backgroundColor = 'transparent';
        } else {
            userAvatarElement.textContent = currentProfile.name ? currentProfile.name[0] : '?';
            userAvatarElement.className = `avatar ${currentProfile.color || 'color-1'}`;
            userAvatarElement.style.backgroundImage = 'none';
        }
    }
}

async function toDashboard(user, profile) {
    if (!user) return;
    
    console.log(`[VivoTV] ⚡ Preparando Dashboard para: ${user.email}`);
    
    // Referencias frescas para evitar fallos por SPA
    const authS = document.getElementById('authSection');
    const dashS = document.getElementById('dashboardSection');
    const navM = document.getElementById('mainNav');
    const mobN = document.querySelector('.mobile-nav');

    // Ocultar Auth de inmediato para evitar que el botón siga girando
    if (authS) authS.classList.add('hidden');
    if (dashS) dashS.classList.remove('hidden');
    if (navM) navM.classList.remove('hidden');
    if (mobN) mobN.classList.remove('hidden');

    // Sincronizar perfil
    currentProfile = profile || JSON.parse(localStorage.getItem('vivotv_current_profile'));

    if (!currentProfile) {
        console.log('[VivoTV] 🔀 Redirigiendo a perfiles...');
        window.location.href = 'profiles.html';
        return;
    }

    updateProfileUI();




    if (userProfile) {
        userProfile.style.cursor = 'pointer';
        userProfile.onclick = () => {
            const exitModal = document.getElementById('exitModal');
            if (exitModal) {
                exitModal.classList.remove('hidden');
                // Asegurar que los botones del modal estén conectados
                setupExitModalListeners();
            } else {
                // Fallback si por alguna razón no existe el modal
                toAuth();
            }
        };
    }

    if (mainNav)     mainNav.classList.remove('hidden');
    if (mobileNav)   mobileNav.classList.remove('hidden');
    
    logDebug('Iniciando Dashboard...');
    
    try {
        // --- NUEVO: CORAZÓN DE SESIÓN (Máx 2 Dispositivos - Fase 3) ---
        startHeartbeat();
        checkConcurrentSessions();
        
        // Poblar contenido inicial
        await populatePageContent();
    } catch (e) {
        console.error('[Dashboard] Error en inicialización:', e);
    }
}

function setupVerMasButtons() {
    const buttons = document.querySelectorAll('.btn-ver-mas');
    const gridHeader = document.querySelector('.grid-header') || document.getElementById('gridContainer');
    
    if (!buttons.length || !gridHeader) return;

    buttons.forEach(btn => {
        // Evitar duplicar listeners
        if (btn.dataset.hasListener) return;

        btn.onclick = (e) => {
            e.preventDefault();
            gridHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        btn.dataset.hasListener = "true";
    });
}
async function renderAnimeDashboardRows(availableIds) {
    const animeParams = { with_genres: 16, sort_by: 'popularity.desc' };
    await Promise.all([
        renderHybridRow('popularCarousel', 
            () => TMDB_SERVICE.fetchFromTMDB('/discover/tv', animeParams), 'tv', 
            () => TMDB_SERVICE.fetchFromTMDB('/discover/tv', { ...animeParams, page: 2 })),
        renderHybridRow('topRatedCarousel', 
            () => TMDB_SERVICE.fetchFromTMDB('/discover/tv', { ...animeParams, sort_by: 'vote_average.desc' }), 'tv'),
        renderHybridRow('genre1Carousel', 
            () => TMDB_SERVICE.fetchFromTMDB('/discover/tv', { with_genres: '16,10759' }), 'tv', null, 10759),
        renderHybridRow('genre2Carousel', 
            () => TMDB_SERVICE.fetchFromTMDB('/discover/tv', { with_genres: '16,10765' }), 'tv', null, 10765),
    ]);
}

async function renderDBCategoryRows() {
    const isMainPage = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
    const isMoviePage = window.location.pathname.includes('peliculas.html');
    const isSeriesPage = window.location.pathname.includes('series.html');
    const isAnimePage = window.location.pathname.includes('anime.html');

    try {
        logDebug('Renderizando filas desde DB...');
        if (isMainPage) {
            // Filas principales por categoría (Nuevas)
            await Promise.all([
                renderDBCatalog('categoryMoviesCarousel', 'movie'),
                renderDBCatalog('categorySeriesCarousel', 'series'),
                renderDBCatalog('categoryAnimeCarousel', 'all', true)
            ]);
            // Mantener compatibilidad con filas antiguas si existen
            await Promise.all([
                renderDBCatalog('popularMoviesCarousel', 'movie'),
                renderDBCatalog('popularTVCarousel', 'series')
            ]);
        } else if (isMoviePage) {
            await renderDBCatalog('popularCarousel', 'movie');
        } else if (isSeriesPage) {
            await renderDBCatalog('popularCarousel', 'series');
        } else if (isAnimePage) {
            await renderDBCatalog('popularCarousel', 'all', true);
        }
    } catch (e) {
        console.error('[DB Render] Error renderizando filas nativas:', e);
    }
}
window.renderDBCategoryRows = renderDBCategoryRows;

function toAuth() {
    // Ya no hacemos sessionStorage.clear() aquí para evitar borrar el perfil al cargar.

    const isAuthPage = window.location.pathname.endsWith('index.html') ||
                       window.location.pathname.endsWith('registro.html') ||
                       window.location.pathname === '/' ||
                       window.location.pathname.endsWith('vivoweb/');

    if (!isAuthPage) { window.location.href = 'index.html'; return; }

    const authSection = document.getElementById('authSection');
    const dashSection = document.getElementById('dashboardSection');
    const userProfile = document.getElementById('userProfile');
    const mainNav = document.getElementById('mainNav');
    const mobileNav = document.querySelector('.mobile-nav');

    if (authSection) authSection.classList.remove('hidden');
    if (dashSection) dashSection.classList.add('hidden');
    if (userProfile) userProfile.classList.add('hidden');
    if (mainNav)     mainNav.classList.add('hidden');
    if (mobileNav) {
        mobileNav.classList.add('hidden');
        mobileNav.style.display = 'none'; // Forzar ocultación absoluta
    }
    if (searchBox)   searchBox.classList.add('hidden');
    if (loginForm)   loginForm.reset();
    if (authError)   authError.classList.add('hidden');
    TMDB_SERVICE.getImagesForAuthBg().then(CATALOG_UI.renderAuthBg);
}

// HERO rotation
let heroRotationTimer, heroCurrentIndex = 0;
function startHeroRotation() {
    if (!heroItems.length || !document.getElementById('heroBanner')) return;
    stopHeroRotation();
    heroRotationTimer = setInterval(() => {
        heroCurrentIndex = (heroCurrentIndex + 1) % heroItems.length;
        CATALOG_UI.renderHero(heroItems[heroCurrentIndex], heroItems);
    }, 8000);
}
function stopHeroRotation() { if (heroRotationTimer) { clearInterval(heroRotationTimer); heroRotationTimer = null; } }
// ================================================
// GESTIÓN DE EVENTOS: LOGIN / REGISTRO / PERFILES
// ================================================
function setupAuthListeners() {
    const loginForm = document.getElementById('loginForm');
    const toggleLink = document.getElementById('toggleAuthMode');
    const btnPass = document.getElementById('btnTogglePass');
    const passwordEl = document.getElementById('password');
    const eyeIcon = document.getElementById('eyeIcon');
    const emailEl = document.getElementById('email');
    const usernameEl = document.getElementById('username');

    if (loginForm) {
        console.log('[VivoTV] Capturando listener de Login/Registro...');
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            setLoading(true);
            const authError = document.getElementById('authError');
            if (authError) authError.classList.add('hidden');

            try {
                const email = emailEl?.value.trim();
                const password = passwordEl?.value;
                
                if (!email || !password) {
                    throw new Error('Por favor, completa todos los campos.');
                }

                if (isLoginMode) {
                    console.log('[Auth] Intentando Login via Supabase...');
                    const { error } = await supabase.auth.signInWithPassword({ email, password });
                    if (error) throw error;
                } else {
                    console.log('[Auth] Intentando Registro via Supabase...');
                    const username = usernameEl ? usernameEl.value.trim() : 'Usuario';
                    const { error } = await supabase.auth.signUp({ 
                        email, 
                        password,
                        options: { data: { username: username, name: username } }
                    });
                    if (error) throw error;
                    
                    // ÉXITO REGISTRO: UI Minimalista
                    const authCard = document.querySelector('.auth-card');
                    if (authCard) {
                        authCard.innerHTML = `
                            <div class="registration-success-ui">
                                <div class="success-icon">📩</div>
                                <h3>¡Correo enviado!</h3>
                                <p>Revisa tu bandeja de entrada en: <strong>${email}</strong></p>
                                <button class="btn btn-primary btn-block" onclick="window.location.reload()">Regresar</button>
                            </div>
                        `;
                    }
                    showToast('📩 Revisa tu correo para activar la cuenta.', 'success');
                }
            } catch (err) {
                console.error('[Auth Error]:', err.message);
                const authError = document.getElementById('authError');
                if (authError) {
                    authError.textContent = mapError(err.message);
                    authError.classList.remove('hidden');
                }
                showToast(mapError(err.message), 'error');
            } finally {
                setLoading(false);
            }
        };
    }

    if (btnPass && passwordEl) {
        btnPass.onclick = () => {
            const isPass = passwordEl.type === 'password';
            passwordEl.type = isPass ? 'text' : 'password';
            if (eyeIcon) {
                eyeIcon.innerHTML = isPass 
                    ? '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.01-.16c0-1.66-1.34-3-3-3l-.16.01z"/>'
                    : '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
            }
        };
    }
}

async function handleLogoutAction() {
    stopHeroRotation(); 
    await stopHeartbeat(); 
    sessionStorage.clear();
    await supabase.auth.signOut(); 
    window.location.href = 'index.html';
}

function setupExitModalListeners() {
    const exitModal = document.getElementById('exitModal');
    const btnSwitchProfile = document.getElementById('btnSwitchProfile');
    const btnLogoutConfirm = document.getElementById('btnLogoutConfirm');
    const btnCancelExit = document.getElementById('btnCancelExit');

    if (btnSwitchProfile) {
        btnSwitchProfile.onclick = () => {
            window.location.href = 'profiles.html';
        };
    }

    if (btnLogoutConfirm) {
        btnLogoutConfirm.onclick = async () => {
            setLoadingLogout(true);
            await handleLogoutAction();
            setLoadingLogout(false);
        };
    }

    if (btnCancelExit) {
        btnCancelExit.onclick = () => {
            if (exitModal) exitModal.classList.add('hidden');
        };
    }

    // Cerrar al hacer clic fuera del contenido
    if (exitModal) {
        exitModal.onclick = (e) => {
            if (e.target === exitModal) exitModal.classList.add('hidden');
        };
    }
}

function setLoadingLogout(loading) {
    const btnSwitchProfile = document.getElementById('btnSwitchProfile');
    const btnLogoutConfirm = document.getElementById('btnLogoutConfirm');
    const btnCancelExit = document.getElementById('btnCancelExit');
    const btns = [btnSwitchProfile, btnLogoutConfirm, btnCancelExit];
    btns.forEach(b => { if(b) b.disabled = loading; });
    if (btnLogoutConfirm) btnLogoutConfirm.textContent = loading ? 'Cerrando...' : 'Cerrar sesión de la cuenta';
}

// Cerrar modal al hacer clic fuera
// Movido dentro de initAppForPage()
if (btnPass) btnPass.addEventListener('click', () => { passwordEl.type = passwordEl.type === 'password' ? 'text' : 'password'; });

if (btnClear) btnClear.addEventListener('click', () => {
    searchInput.value = '';
    btnClear.classList.add('hidden');
    const isSeriesPage = document.body.classList.contains('page-series');
    const type = isSeriesPage ? 'tv' : 'movie';
    loadGridData(type, 1);
});

function setLoading(v) {
    const btnText = document.getElementById('btnText');
    const btnLoader = document.getElementById('btnLoader');
    const btnSubmit = document.getElementById('btnSubmit');
    if (btnText) btnText.classList.toggle('hidden', v);
    if (btnLoader) btnLoader.classList.toggle('hidden', !v);
    if (btnSubmit) btnSubmit.disabled = v;
}

function mapError(msg) {
    const m = msg.toLowerCase();
    if (m.includes('invalid login')) return '❌ Email o contraseña incorrectos.';
    if (m.includes('user already registered')) return '❌ Este correo electrónico ya está registrado.';
    if (m.includes('database error saving new user')) return '⚠️ El nombre de usuario ya existe o hay un error de perfil.';
    return msg;
}

// Expone una función global para que player.js actualice el estado
window.updateGlobalPlaybackStatus = async (status) => {
    const oldTitle = window.VIVOTV_VIEWING_STATUS?.title;
    window.VIVOTV_VIEWING_STATUS = status;
    
    console.log('[Telemetry] Estado actualizado:', status?.title || 'Limpiando...');

    // --- GUARDADO REACTIVO (Fase 16) ---
    // Si el título cambió, forzamos un guardado inmediato en la DB
    const profile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
    if (status?.title && status.title !== oldTitle && supabase && profile) {
        try {
            await supabase
                .from('vivotv_profiles')
                .update({ now_playing: status })
                .eq('id', profile.id);
            logDebug('[Telemetry] Guardado instantáneo exitoso.');
        } catch(e) { console.warn('Error en guardado instantáneo telemetry:', e); }
    }
};

window.addEventListener('beforeunload', () => {
    stopHeartbeat();
});
window.addEventListener('pagehide', () => {
    stopHeartbeat();
});

async function initSearchPage() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    
    // Selectores específicos de la página de búsqueda
    const headerTitle = document.getElementById('searchHeader');
    const mainInput   = document.getElementById('mainSearchInput');
    const filterPills = document.querySelectorAll('.filter-pill');
    
    if (q) {
        if (headerTitle) headerTitle.textContent = `Resultados para "${q}"`;
        if (mainInput)   mainInput.value = q;
        if (searchInput) searchInput.value = q; // Sync navbar
        
        executeSearch(q);
    }

    // Evento para el Input Principal de la página
    if (mainInput) {
        mainInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (searchInput) searchInput.value = val; // Sync navbar
            
            if (searchTimeout) clearTimeout(searchTimeout);
            if (val.length < 3) return;

            searchTimeout = setTimeout(() => executeSearch(val), 500);
        });
    }

    // Eventos para los Filtros (Pills)
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentFilter = pill.dataset.filter;
            applyLocalFilter();
        });
    });
}

async function executeSearch(query) {
    const grid = document.getElementById('searchResultsGrid');
    if (!grid) return;

    CATALOG_UI.showSkeletons('searchResultsGrid', 12);
    
    try {
        const res = await TMDB_SERVICE.fetchFromTMDB('/search/multi', { query });
        if (res && res.results) {
            let lastResults = res.results.filter(item => item.media_type !== 'person');
            lastResults = filterItemsByProfile(lastResults); // Aplicar filtro global

            lastSearchResults = lastResults;
            applyLocalFilter();

            // Actualizar URL sin recargar
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('q', query);
            window.history.pushState({}, '', newUrl);
        }
    } catch (e) {
        console.error('Search error:', e);
    }
}

function applyLocalFilter() {
    let filtered = [...lastSearchResults];
    
    if (currentFilter === 'movie') {
        filtered = filtered.filter(i => i.media_type === 'movie');
    } else if (currentFilter === 'tv') {
        filtered = filtered.filter(i => i.media_type === 'tv' && !i.genre_ids?.includes(16));
    } else if (currentFilter === 'anime') {
        filtered = filtered.filter(i => i.genre_ids?.includes(16));
    }

    renderSearchResults(filtered);
}

function renderSearchResults(results) {
    const grid = document.getElementById('searchResultsGrid');
    const empty = document.getElementById('noResultsState');
    if (!grid) return;

    grid.innerHTML = '';
    
    if (!results || results.length === 0) {
        empty?.classList.remove('hidden');
        return;
    }

    empty?.classList.add('hidden');
    
    // --- OPTIMIZACIÓN: DOCUMENT FRAGMENT ---
    const fragment = document.createDocumentFragment();
    results.forEach((item, index) => {
        const type = item.media_type || (item.title ? 'movie' : 'tv');
        const isAvail = availableIds.has(item.id.toString()) || availableIds.has(item.id);
        const card = CATALOG_UI.createMovieCard(item, type, isAvail);
        
        // Animación de entrada escalonada
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        fragment.appendChild(card);
        
        setTimeout(() => {
            card.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 50);
    });
    grid.appendChild(fragment);
}

async function loadMyList() {
    const section = document.getElementById('myListSection');
    const carousel = document.getElementById('myListCarousel');
    const favoritesGrid = document.getElementById('favoritesGrid');
    const emptyState = document.getElementById('emptyListState');
    
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    // Fetch favorites x Perfil (Expansión SQL Script)
    const { data: favs } = await supabase.from('user_favorites')
        .select('tmdb_id')
        .eq('user_id', user.id)
        .eq('profile_id', currentProfile.id)
        .order('created_at', { ascending: false });

    // Handle dedicated page grid if exists
    if (favoritesGrid) {
        if (!favs || favs.length === 0) {
            favoritesGrid.innerHTML = '';
            emptyState?.classList.remove('hidden');
            return;
        }
        emptyState?.classList.add('hidden');
        
    // Cargar detalles EN PARALELO con endpoint LIGERO (getSummary)
    // Antes: 20 llamadas secuenciales (~14s) → Ahora: todas a la vez (~700ms)
    favoritesGrid.innerHTML = '';
    CATALOG_UI.showSkeletons('favoritesGrid', Math.min(favs.length, 8));

    const detailResults = await Promise.all(
        favs.map(item =>
            TMDB_SERVICE.getSummary(item.tmdb_id, item.type || 'movie').catch(() => null)
        )
    );

    favoritesGrid.innerHTML = '';
    detailResults.forEach((details, i) => {
        if (!details || !details.id) return;
        const isAvail = availableIds.has(favs[i].tmdb_id?.toString()) || availableIds.has(favs[i].tmdb_id);
        const card = CATALOG_UI.createMovieCard(details, favs[i].type || 'movie', isAvail);
        favoritesGrid.appendChild(card);
    });
    return;
    }

    // Handle home carousel if exists
    if (section && carousel) {
        if (favs?.length) {
            section.classList.remove('hidden');
            const details = await Promise.all(favs.slice(0, 15).map(f => TMDB_SERVICE.getDetails(f.tmdb_id, f.type || 'movie')));
            CATALOG_UI.renderCarousel('myListCarousel', details.filter(d => d), null, availableIds, null, DB_CATALOG);
        } else {
            section.classList.add('hidden');
        }
    }
}

async function loadPersonalizedRows() {
    const section = document.getElementById('recommendedSection');
    const carousel = document.getElementById('recommendedCarousel');
    if (!section || !carousel || !supabase) return;

    if (!currentProfile) {
        currentProfile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
    }
    if (!currentProfile) return;

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    logDebug('Cargando recomendaciones personalizadas...');

    try {
        // Obtener favoritos e historial para cruzar datos
        const [{ data: favs }, { data: history }] = await Promise.all([
            supabase.from('user_favorites').select('tmdb_id, type').eq('profile_id', currentProfile.id),
            supabase.from('watch_history').select('tmdb_id, type').eq('profile_id', currentProfile.id).order('last_watched', { ascending: false }).limit(20)
        ]);

        const combinedIds = new Set();
        (favs || []).forEach(f => combinedIds.add(`${f.type}:${f.tmdb_id}`));
        (history || []).forEach(h => combinedIds.add(`${h.type}:${h.tmdb_id}`));

        if (combinedIds.size === 0) {
            // Si no hay datos, mostrar algo genérico o simplemente ocultar
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        CATALOG_UI.showSkeletons('recommendedCarousel', 6);

        // Algoritmo de recomendación simple: tomar géneros de los favoritos/vistos
        // Por ahora, mostraremos una mezcla de lo que ya han visto/marcado como favorito 
        // pero que esté en el catálogo disponible.
        
        const details = await Promise.all(Array.from(combinedIds).slice(0, 12).map(async key => {
            const [type, id] = key.split(':');
            return TMDB_SERVICE.getDetails(id, type).catch(() => null);
        }));

        const filtered = details.filter(d => d && availableIds.has(d.id.toString()));
        
        if (filtered.length > 0) {
            CATALOG_UI.renderCarousel('recommendedCarousel', filtered, null, availableIds, null, DB_CATALOG);
        } else {
            section.classList.add('hidden');
        }
    } catch (e) {
        console.error('Error cargando recomendaciones:', e);
        section.classList.add('hidden');
    }
}

async function loadRecentlyWatched() {
    const section = document.getElementById('recentSection');
    const carousel = document.getElementById('recentCarousel');
    if (!section || !carousel || !supabase) return;

    if (!currentProfile) {
        currentProfile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
    }
    if (!currentProfile) return;

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;
    
    const { data: history } = await supabase.from('watch_history')
        .select('*')
        .eq('user_id', user.id)
        .eq('profile_id', currentProfile.id)
        .order('last_watched', { ascending: false })
        .limit(50); // Aumentado de 20 a 50 (Fase Persistencia)
        
    if (!history?.length) { 
        if (section) section.classList.add('hidden'); 
        return; 
    }
    
    carousel.innerHTML = '';
    
    // Filtro para mostrar solo el último progreso de cada título
    const seen = new Set();
    const unique = history.filter(h => {
        const id = String(h.tmdb_id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });

    // Parallel con getSummary (endpoint ligero) — antes usaba getDetails pesado
    const results = await Promise.all(unique.map(item => 
        TMDB_SERVICE.getSummary(item.tmdb_id, item.type)
            .then(details => ({ details, historyItem: item }))
            .catch(() => null)
    ));
    
    const path = window.location.pathname;
    const isPeliculasPage = path.includes('peliculas.html');
    const isSeriesPage = path.includes('series.html');
    const isAnimePage = path.includes('anime.html');
    
    let renderedCount = 0;

    results.forEach(res => {
        if (!res || !res.details || !res.details.poster_path) return;
        const { details, historyItem } = res;
        
        const genreIds = details.genres ? details.genres.map(g => g.id) : (details.genre_ids || []);
        const isItemAnime = genreIds.includes(16);

        if (isPeliculasPage && historyItem.type !== 'movie') return;
        if (isSeriesPage && (historyItem.type !== 'tv' || isItemAnime)) return;
        if (isAnimePage && (historyItem.type !== 'tv' || !isItemAnime)) return;
        
        let progressPercent = null;
        let runtime = details.runtime || (details.episode_run_time ? details.episode_run_time[0] : null);
        
        if (historyItem.progress_seconds && runtime) {
            const totalSecs = runtime * 60;
            progressPercent = Math.min(100, Math.floor((historyItem.progress_seconds / totalSecs) * 100));
        } else if (historyItem.progress_seconds > 0) {
            progressPercent = 5; 
        }

        const card = CATALOG_UI.createMovieCard(details, historyItem.type, true, null, progressPercent);
        carousel.appendChild(card);
        renderedCount++;
    });

    if (renderedCount === 0) {
        section.classList.add('hidden');
    } else {
        section.classList.remove('hidden');
    }
}

async function loadRecommendedItems() {
    const section = document.getElementById('recommendedSection');
    const carousel = document.getElementById('recommendedCarousel');
    if (!section || !carousel || !supabase) return;

    try {
        const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
        if (!user) return;

        // 1. Obtener base para recomendaciones (Historial + Favoritos)
        const [{ data: history }, { data: favs }] = await Promise.all([
            supabase.from('watch_history').select('tmdb_id, type').eq('profile_id', currentProfile.id).order('last_watched', { ascending: false }).limit(5),
            supabase.from('user_favorites').select('tmdb_id, type').eq('profile_id', currentProfile.id).order('created_at', { ascending: false }).limit(5)
        ]);
        
        const baseItems = [];
        const seenInBase = new Set();
        [...(history || []), ...(favs || [])].forEach(item => {
            const key = `${item.type}:${item.tmdb_id}`;
            if (!seenInBase.has(key)) {
                baseItems.push(item);
                seenInBase.add(key);
            }
        });

        if (baseItems.length === 0) {
            section.classList.add('hidden');
            return;
        }

        // 2. Obtener recomendaciones de TMDB para la base combinada
        const recommendationPromises = baseItems.map(h => 
            TMDB_SERVICE.getRecommendations(h.tmdb_id, h.type).catch(() => ({ results: [] }))
        );
        
        const allRes = await Promise.all(recommendationPromises);
        let combinedResults = [];
        allRes.forEach(res => {
            if (res && res.results) combinedResults.push(...res.results);
        });

        // 3. Filtrar: Disponibles en BD + No vistos aún + Unicidad
        const historyIds = new Set(history.map(h => h.tmdb_id.toString()));
        const seenInRecs = new Set();
        
        let filtered = combinedResults.filter(item => {
            const id = item.id.toString();
            if (seenInRecs.has(id)) return false;
            if (historyIds.has(id)) return false;
            if (!availableIds.has(id)) return false;
            seenInRecs.add(id);
            return true;
        });

        // Aplicar filtro de perfil (Kids)
        filtered = filterItemsByProfile(filtered);

        if (filtered.length === 0) {
            section.classList.add('hidden');
        } else {
            section.classList.remove('hidden');
            CATALOG_UI.renderCarousel('recommendedCarousel', filtered.slice(0, 20), null, availableIds, null, DB_CATALOG);
        }
    } catch (e) {
        console.error('Error in loadRecommendedItems:', e);
        section.classList.add('hidden');
    }
}

async function loadFullHistory() {
    const grid = document.getElementById('historyGrid');
    const emptyState = document.getElementById('emptyHistoryState');
    if (!grid || !supabase) return;

    if (!currentProfile) {
        currentProfile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
    }
    if (!currentProfile) return;

    // CORRECCIÓN: getSession() usa caché local, getUser() hace un round-trip al servidor
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data: history } = await supabase.from('watch_history')
        .select('*')
        .eq('user_id', user.id)
        .eq('profile_id', currentProfile.id)
        .order('last_watched', { ascending: false })
        .limit(200); // Límite amplio para la página de Historial

    if (!history?.length) {
        grid.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    grid.innerHTML = '';
    const seen = new Set();
    const unique = history.filter(h => {
        const id = String(h.tmdb_id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });

    // Parallel con getSummary (endpoint ligero) para el historial completo
    const details = await Promise.all(unique.map(item => 
        TMDB_SERVICE.getSummary(item.tmdb_id, item.type)
            .then(d => ({ ...d, historyItem: item }))
            .catch(() => null)
    ));

    details.forEach(item => {
        if (!item || !item.poster_path) return;
        
        let progressPercent = null;
        let runtime = item.runtime || (item.episode_run_time ? item.episode_run_time[0] : null);
        if (item.historyItem.progress_seconds && runtime) {
            progressPercent = Math.min(100, Math.floor((item.historyItem.progress_seconds / (runtime * 60)) * 100));
        }

        const card = CATALOG_UI.createMovieCard(item, item.historyItem.type, true, null, progressPercent);
        
        // Inyectar Botón de Eliminación (1-Clic)
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove-history';
        removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
        removeBtn.title = 'Eliminar del Historial';
        
        removeBtn.onclick = async (e) => {
            e.stopPropagation();
            removeBtn.innerHTML = '<div class="loader" style="width:16px;height:16px;"></div>';
            
            const { error } = await supabase.from('watch_history')
                .delete()
                .eq('id', item.historyItem.id);
                
            if (!error) {
                card.style.transform = 'scale(0.8)';
                card.style.opacity = '0';
                setTimeout(() => card.remove(), 300);
            } else {
                removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
            }
        };
        
        const inner = card.querySelector('.movie-card-inner');
        if (inner) inner.appendChild(removeBtn);

        grid.appendChild(card);
    });
}

window.addEventListener('update-my-list', loadMyList);
window.addEventListener('update-recent', loadRecentlyWatched);
if (btnFav) btnFav.addEventListener('click', () => PLAYER_LOGIC.toggleFavorite(supabase));
window.addEventListener('open-movie-detail', (e) => { PLAYER_LOGIC.openDetail(e.detail.tmdbId, e.detail.type, supabase, availableIds); });
const btnCloseModal = document.getElementById('btnCloseModal');
if (btnCloseModal) btnCloseModal.addEventListener('click', () => PLAYER_LOGIC.closeModal());
const btnHeroPlay = document.getElementById('btnHeroPlay');
if (btnHeroPlay) btnHeroPlay.addEventListener('click', (e) => {
    const b = e.currentTarget;
    PLAYER_LOGIC.openDetail(b.dataset.tmdbId, b.dataset.type, supabase);
});

const btnHeroInfo = document.getElementById('btnHeroInfo');
if (btnHeroInfo) btnHeroInfo.addEventListener('click', (e) => {
    const b = e.currentTarget;
    PLAYER_LOGIC.openDetail(b.dataset.tmdbId, b.dataset.type, supabase);
});
// El manejo de btnModalPlay y btnCloseModal ahora se gestiona directamente en PLAYER_LOGIC.openDetail
// para una mayor reactividad y menor acoplamiento.


// ---- SISTEMA DE SCROLL PREMIUM (Fase Auditoria Scroll) ----

let isDragging = false;
let startX, scrollLeft;

document.addEventListener('mousedown', (e) => {
    const carousel = e.target.closest('.carousel');
    if (!carousel) return;
    isDragging = true;
    startX = e.pageX - carousel.offsetLeft;
    scrollLeft = carousel.scrollLeft;
    carousel.style.scrollSnapType = 'none';
    carousel.style.scrollBehavior = 'auto';
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const carousel = e.target.closest('.carousel');
    if (!carousel) return;
    e.preventDefault();
    const x = e.pageX - carousel.offsetLeft;
    const walk = (x - startX) * 2; 
    carousel.scrollLeft = scrollLeft - walk;
});

const stopDragging = (e) => {
    if (!isDragging) return;
    isDragging = false;
    const carousel = e.target.closest('.carousel');
    if (carousel) {
        carousel.style.scrollSnapType = 'x mandatory';
        carousel.style.scrollBehavior = 'smooth';
        updateCarouselArrows(carousel);
    }
};

document.addEventListener('mouseup', stopDragging);
document.addEventListener('mouseleave', stopDragging);

// --- INICIALIZACIÓN DE PÁGINA DE HISTORIAL (Fase Historial) ---
// ================================================
// SPA ENGINE: RE-INICIALIZACIÓN DE PÁGINA
// ================================================
function initAppForPage() {
    const path = window.location.pathname;
    fatalLog(`[SPA Engine] Inicializando página: ${path}`);

    // Detener rotaciones e intervalos previos para evitar desbordamiento de memoria
    stopHeroRotation();
    stopHeartbeat();

    // Obtener referencias DOM dinámicamente (Esenciales en cada cambio de innerHTML)
    authSection = document.getElementById('authSection');
    dashSection = document.getElementById('dashboardSection');
    loginForm = document.getElementById('loginForm');
    emailEl = document.getElementById('email');
    usernameEl = document.getElementById('username');
    passwordEl = document.getElementById('password');
    btnSubmit = document.getElementById('btnSubmit');
    btnText = document.getElementById('btnText');
    btnLoader = document.getElementById('btnLoader');
    authError = document.getElementById('authError');
    toggleLink = document.getElementById('toggleAuthMode');
    userProfile = document.getElementById('userProfile');
    mainNav = document.getElementById('mainNav');
    mobileNav = document.querySelector('.mobile-nav');
    btnLogout = document.getElementById('btnLogout');
    userNameEl = document.getElementById('userName');
    userAvatar = document.getElementById('userAvatar');
    searchBox = document.getElementById('searchBox');
    searchInput = document.getElementById('searchInput');
    btnClear = document.getElementById('btnClearSearch');
    btnFav = document.getElementById('btnAddToMyList');
    btnPass = document.getElementById('btnTogglePass');
    authTitle = document.getElementById('authTitle');
    authSubtitle = document.getElementById('authSubtitle');
    exitModal = document.getElementById('exitModal');
    btnSwitchProfile = document.getElementById('btnSwitchProfile');
    btnLogoutConfirm = document.getElementById('btnLogoutConfirm');
    btnCancelExit = document.getElementById('btnCancelExit');

    try {
        setupAuthListeners();
        // 1. Asegurar Auth
        initializeVivotvApp();
        
        // 2. Si ya estamos inicializados, forzar recarga de contenido para la nueva "página"
        if (window.VIVOTV_AUTH_INITIALIZED) {
            populatePageContent();
        }
    } catch(e) { fatalLog('Error crítico en inicialización SPA: ' + e.message); }

    // 3. Cargar lógica específica
    if (path.includes('historial.html')) {
        loadFullHistory();
    }

    // Configurar event listeners que dependen de referencias DOM
    if (exitModal) {
        setupExitModalListeners();
    }

    if (btnPass && passwordEl) {
        btnPass.addEventListener('click', () => {
            passwordEl.type = passwordEl.type === 'password' ? 'text' : 'password';
        });
    }

    if (btnClear && searchInput) {
        btnClear.addEventListener('click', () => {
            searchInput.value = '';
            btnClear.classList.add('hidden');
            const isSeriesPage = document.body.classList.contains('page-series');
            const type = isSeriesPage ? 'tv' : 'movie';
            loadGridData(type, 1);
        });
    }

    // Configurar event listeners de búsqueda
    if (searchBox && searchInput) {
        searchBox.addEventListener('click', (e) => {
            searchBox.classList.add('active');
            searchInput.focus();
            e.stopPropagation();
        });
        
        if (!window._searchBoxListenerBound) {
            document.addEventListener('click', (e) => {
                const currentSearchBox = document.getElementById('searchBox');
                if (currentSearchBox && !currentSearchBox.contains(e.target)) {
                    currentSearchBox.classList.remove('active');
                }
            });
            window._searchBoxListenerBound = true;
        }
    }

    if (searchInput && searchBox && btnClear) {
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.trim();
            btnClear.classList.toggle('hidden', q.length === 0);

            if (searchTimeout) clearTimeout(searchTimeout);
            if (q.length < 3) return;

            searchTimeout = setTimeout(async () => {
                const res = await TMDB_SERVICE.fetchFromTMDB('/search/multi', { query: q });
                if (res && res.results) {
                    const isSearchPage = window.location.pathname.includes('busqueda.html');

                    if (isSearchPage) {
                        executeSearch(q);
                    } else {
                        let filtered = res.results.filter(item => availableIds.has(item.id.toString()));
                        filtered = filterItemsByProfile(filtered); // Aplicar filtro global

                        const isMoviesPage = document.body.classList.contains('page-movies');
                        const isSeriesPage = document.body.classList.contains('page-series');
                        const targetId = isMoviesPage ? 'popularCarousel' : (isSeriesPage ? 'popularCarousel' : 'trendingCarousel');
                        CATALOG_UI.renderCarousel(targetId, filtered, null, availableIds, `🔍 Resultados para "${q}"`, DB_CATALOG);
                    }
                }
            }, 400);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const q = e.target.value.trim();
                if (q.length >= 3) {
                    window.location.href = `busqueda.html?q=${encodeURIComponent(q)}`;
                }
            }
        });
    }

    // FASE 4: Búsqueda por Vibras
    const moodChips = document.getElementById('moodChips');
    if (moodChips) {
        moodChips.querySelectorAll('.mood-chip').forEach(chip => {
            chip.onclick = async () => {
                const mood = chip.dataset.mood;
                const { filterByMood, MOOD_MAP } = await import('./catalog.js');
                
                // UI feedback
                moodChips.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');

                // Filtrar el catálogo disponible basado en la vibra
                const results = filterByMood(window.DB_CATALOG || [], mood);
                const targetId = 'searchResultsGrid'; // En busqueda.html
                const grid = document.getElementById(targetId);
                
                if (grid) {
                    grid.innerHTML = '';
                    if (results.length === 0) {
                        document.getElementById('noResultsState')?.classList.remove('hidden');
                    } else {
                        document.getElementById('noResultsState')?.classList.add('hidden');
                        results.forEach(item => {
                            const card = CATALOG_UI.createMovieCard(item, item.media_type || 'movie', true, null, null);
                            grid.appendChild(card);
                        });
                    }
                }
                
                document.getElementById('searchHeader').textContent = `Vibra: ${chip.textContent}`;
            };
        });
    }

    // Actualizar flechas de carruseles si existen
    document.querySelectorAll('.carousel').forEach(updateCarouselArrows);
}

// Escuchar cambios de página vía SPA (desde layout.js)
window.addEventListener('vivotv:page-changed', initAppForPage);

// ================================================
// FASE 5: BINGE-WATCH UX (Auto-Next Episode)
// ================================================
window.addEventListener('vivotv:binge_prompt', (e) => {
    const { season, episode } = e.detail;
    
    // Obtener catálogo de base de datos actual (para detalles)
    // El PLAYER_LOGIC tiene el seriesData guardado si pasamos por renderSeriesInfo, 
    // pero lo mejor es obtenerlo de CATALOG_UI que guarda temporales o pedir la info a TMDB en segundo plano.
    // Usaremos el objeto series asumiendo que el usuario ya estaba en el modal Series.
    
    const promptEl = document.getElementById('bingePrompt');
    if (!promptEl) return;
    
    // Mostramos el overlay UI
    promptEl.classList.remove('hidden');
    
    let countdown = 5;
    document.getElementById('bingeCountdown').textContent = countdown;
    document.getElementById('bingeNextTitle').textContent = `Temporada ${season} - Episodio ${episode + 1}`;
    
    const interval = setInterval(() => {
        countdown--;
        document.getElementById('bingeCountdown').textContent = countdown;
        if (countdown <= 0) {
            clearInterval(interval);
            executeNextEpisode();
        }
    }, 1000);
    
    const btnPlay = document.getElementById('btnBingePlay');
    const btnCancel = document.getElementById('btnBingeCancel');
    
    const executeNextEpisode = () => {
        clearInterval(interval);
        promptEl.classList.add('hidden');
        
        // Usar la lógica nativa del reproductor para saltar de inmediato al próximo contenido en base de datos.
        import('./player.js').then(({ PLAYER_LOGIC }) => {
            PLAYER_LOGIC.playNextEpisodeFrom(season, episode, window._supabase || window.supabase || supabase);
        }).catch(err => {
            // Fallback en caso de lazy loading
            if (window.PLAYER_LOGIC) window.PLAYER_LOGIC.playNextEpisodeFrom(season, episode, supabase);
        });
    };

    btnPlay.onclick = executeNextEpisode;
    btnCancel.onclick = () => {
        clearInterval(interval);
        promptEl.classList.add('hidden');
        console.log('[VivoTV] Binge-Watch cancelado por el usuario.');
    };
});

// Inicialización robusta para Módulos ESM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppForPage);
} else {
    initAppForPage();
}

// Listener PROGRESIVO para actualizar la UI conforme llegan los lotes
window.addEventListener('batchLoaded', (e) => {
    const { ids } = e.detail;
    if (!ids || !ids.length) return;

    // Actualizar badges en pantalla SOLO para los IDs recibidos en este lote
    const cards = document.querySelectorAll('.movie-card');
    cards.forEach(card => {
        const cardTmdbId = card.dataset.tmdbId;
        if (ids.includes(cardTmdbId)) {
            const badge = card.querySelector('.coming-soon-badge');
            if (badge) {
                // Aplicar clase de animación
                badge.classList.add('availability-pop');
                
                setTimeout(() => {
                    badge.className = 'available-badge';
                    badge.innerHTML = '<svg viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> DISPONIBLE';
                }, 300);
            }
        }
    });
});

// Listener heredado para compatibilidad
window.addEventListener('contentAdded', async (e) => {
    const { tmdb_id } = e.detail;
    if (window.availableIds) window.availableIds.add(tmdb_id);
    window.dispatchEvent(new CustomEvent('batchLoaded', { detail: { ids: [tmdb_id] } }));
});


// Sincronización inteligente de bajo impacto (cada 2 minutos)
// Solo refresca si el caché de sesión está vencido o próximo a vencer.
// Evita tráfico a Supabase si sessionStorage aún tiene datos frescos.
setInterval(async () => {
    try {
        const ts = sessionStorage.getItem('vivo_db_catalog_ts_v1');
        const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutos (igual que catalog.js)
        const REFRESH_THRESHOLD = 25 * 60 * 1000; // Refrescar cuando faltan 5 min
        
        if (ts && (Date.now() - parseInt(ts)) < REFRESH_THRESHOLD) {
            // Caché reciente — no hace falta refrescar
            return;
        }
        
        console.log('[VivoTV] 🔄 Caché próximo a expirar, refrescando catálogo...');
        await fetchAvailableIds(); 
    } catch (e) {
        console.warn('Error actualizando disponibles:', e);
    }
}, 120000); // Chequeamos cada 2 minutos, pero solo actuamos cuando es necesario


// Manejo de Flechas
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.carousel-arrow');
    if (!btn) return;
    const wrapper = btn.closest('.carousel-wrapper');
    const carousel = wrapper ? wrapper.querySelector('.carousel') : null;
    if (!carousel) return;
    
    const direction = btn.classList.contains('carousel-arrow-left') ? -1 : 1;
    const scrollAmount = carousel.clientWidth * 0.8;
    carousel.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
    
    // Pequeño delay para actualizar tras el scroll smooth
    setTimeout(() => updateCarouselArrows(carousel), 500);
});

// Función para ocultar/mostrar flechas según posición
function updateCarouselArrows(carousel) {
    const wrapper = carousel.closest('.carousel-wrapper');
    if (!wrapper) return;
    const leftBtn = wrapper.querySelector('.carousel-arrow-left');
    const rightBtn = wrapper.querySelector('.carousel-arrow-right');
    
    if (leftBtn) leftBtn.style.opacity = carousel.scrollLeft <= 10 ? '0' : '1';
    if (rightBtn) {
        const isAtEnd = (carousel.scrollLeft + carousel.clientWidth) >= (carousel.scrollWidth - 10);
        rightBtn.style.opacity = isAtEnd ? '0' : '1';
    }
}

// Escuchar scroll para actualizar flechas (touch/mousewheel)
document.addEventListener('scroll', (e) => {
    if (e.target.classList?.contains('carousel')) {
        updateCarouselArrows(e.target);
    }
}, true);



// ================================================
// GLOBAL SYNC: REFRESH ON VISIBILITY
// ================================================
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const path = window.location.pathname;
        if (!path.includes('registro.html') && !path.includes('login.html')) {
            console.log('[Global Sync] Pestaña visible, refrescando estado...');
            loadRecentlyWatched();
            loadMyList();
        }
    }
});
