import { CONFIG, supabase } from './config.js';
import { TMDB_SERVICE, CATALOG_UI } from './tmdb.js';
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
    DB_CATALOG
} from './catalog.js';

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
let currentProfile    = null;
let heartbeatTimer    = null;
let sessionChannel    = null;

// El estado y validaciones ahora se importan de catalog.js para consistencia SPA
const getAvailableIds = () => window.availableIds || new Set();
const getDBCatalog    = () => window.DB_CATALOG || [];

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

// Inicializar efectos al cargar
document.addEventListener('DOMContentLoaded', () => {
    initNavbarScroll();
    initMagneticHover();
    
    // Solo inicializar navegación móvil si hay un perfil activo
    if (mobileNav && currentProfile) {
        initMobileNavIndicator();
        initMagicSlide();
    }
    
    if (typeof initAuth === 'function') initAuth();
});

// Actualizar posición si cambia el tamaño de pantalla
window.addEventListener('resize', initMobileNavIndicator);
window.addEventListener('orientationchange', () => setTimeout(initMobileNavIndicator, 200));



// NUEVO: La sincronización del catálogo ahora se maneja centralmente en catalog.js
async function fetchAvailableIds() {
    await syncCatalog(supabase);
}

// --- NUEVO: Scope Global de Auth para evitar duplicados en SPA ---
let authStateListenerSet = false;

async function initAuth() {
    if (!supabase) return;

    if (!authStateListenerSet) {
        logDebug('[Auth] Configurando listener global de estado...');
        supabase.auth.onAuthStateChange(async (event, session) => {
            logDebug(`[Auth Event] ${event}`);
            if (session?.user) {
                const isAuthPage = window.location.pathname.endsWith('index.html') || 
                                   window.location.pathname.endsWith('registro.html') ||
                                   window.location.pathname === '/' ||
                                   window.location.pathname.endsWith('vivoweb/');
                
                if (isAuthPage) {
                    if (!isDashboardInit) toDashboard(session.user);
                } else {
                    if (dashSection) dashSection.classList.remove('hidden');
                    if (authSection) authSection.classList.add('hidden');
                    
                    if (!currentProfile) {
                        currentProfile = JSON.parse(sessionStorage.getItem('vivotv_current_profile'));
                        if (!currentProfile && !window.location.pathname.includes('profiles.html')) {
                            window.location.href = 'profiles.html';
                            return;
                        }
                    }
                    if (currentProfile && userNameEl) userNameEl.textContent = currentProfile.name;
                }
            } else {
                toAuth();
            }
        });
        authStateListenerSet = true;
    }

    // Verificación inmediata de sesión
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        if (!isDashboardInit) toDashboard(user);
    } else {
        toAuth();
    }
}

let isDashboardInit = false;
async function toDashboard(user) {
    if (!user) return;
    
    // Si ya se está inicializando, evitar duplicados
    if (isDashboardInit) return;
    isDashboardInit = true;
    
    logDebug(`[toDashboard] Iniciando para usuario: ${user.email} en ${window.location.pathname}`);
    
    // Obtener referencias DOM localmente
    const authSection = document.getElementById('authSection');
    const dashSection = document.getElementById('dashboardSection');
    const userProfile = document.getElementById('userProfile');
    const userNameEl = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    const mainNav = document.getElementById('mainNav');
    const mobileNav = document.querySelector('.mobile-nav');

    // Asegurar visibilidad del dashboard
    if (authSection) authSection.classList.add('hidden');
    if (dashSection) {
        dashSection.classList.remove('hidden');
        logDebug('[toDashboard] dashSection visible.');
    } else {
        console.error('[ERROR] dashSection no encontrado al iniciar dashboard.');
    }
    if (userProfile) userProfile.classList.remove('hidden');

    // --- GESTIÓN DE PERFILES (Fase 8: Sesión Temporal) ---
    currentProfile = JSON.parse(sessionStorage.getItem('vivotv_current_profile'));

    if (!currentProfile) {
        console.warn('[VivoTV] No hay perfil en sesión. Redirigiendo...');
        window.location.href = 'profiles.html';
        return;
    }

    if (userNameEl) {
        userNameEl.textContent = currentProfile.name;
    }
    if (userAvatar) {
        userAvatar.textContent = currentProfile.name[0];
        userAvatar.style.backgroundImage = 'none';
        userAvatar.className = `avatar ${currentProfile.color}`;
        userAvatar.style.backgroundColor = ''; // Usar clase CSS
        userAvatar.style.color = '#fff';
        userAvatar.style.fontWeight = 'bold';
    }

    if (userProfile) {
        userProfile.style.cursor = 'pointer';
        userProfile.onclick = () => {
            toAuth(); // Redirigir directo a la selección de cuentas
        };
    }

    if (mainNav)     mainNav.classList.remove('hidden');
    if (mobileNav)   mobileNav.classList.remove('hidden');
    
    logDebug('Iniciando Dashboard...');
    
    // --- NUEVO: CORAZÓN DE SESIÓN (Máx 2 Dispositivos - Fase 3) ---
    startHeartbeat();
    checkConcurrentSessions();
    
    if (window.location.hash !== '#linkMyList') window.scrollTo(0, 0);

    // --- LIMPIEZA: Limpiar carouseles residuales de páginas anteriores ---
    const carouselIds = [
        'trendingCarousel', 'popularMoviesCarousel', 'topRatedCarousel', 'popularTVCarousel',
        'actionCarousel', 'comedyCarousel', 'dramaCarousel', 'horrorCarousel',
        'popularCarousel', 'genre1Carousel', 'genre2Carousel', 'genre3Carousel', 'genre4Carousel',
        'recommendedCarousel'
    ];
    carouselIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = ''; // Limpiar contenido residual
    });

    // 1. Limpieza absoluta: Ocultar todas las secciones antes de decidir qué mostrar (MODO SPA)
    const allSections = ['trendingSection', 'popularSection', 'topRatedSection', 'actionSection', 'comedySection', 'horrorSection', 'scifiSection', 'recommendedSection', 'recentSection', 'myListSection', 'popularMoviesSection', 'popularTVSection'];
    allSections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // 2. Mostrar skeletons solo para los carruseles que EXISTEN en este HTML específico
    carouselIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = ''; // Limpiar contenido previo
            CATALOG_UI.showSkeletons(id);
            // Asegurar que el padre del carrusel (la sección) sea visible si no es una sección especial
            const section = el.closest('.catalog-row');
            if (section && !['recentSection', 'recommendedSection', 'myListSection'].includes(section.id)) {
                section.classList.remove('hidden');
            }
        }
    });

    // Limpiar grid si existe
    const gridContainer = document.getElementById('gridContainer');
    if (gridContainer) gridContainer.innerHTML = '';

    try {
        // 2. Sincronizar Catálogo Personal (En segundo plano)
        // Ya no bloqueamos la app esperando miles de registros
        syncCatalog(supabase); 


        // 3. NUEVO: Renderizado impulsado por DB (Prioridad Máxima)
        renderDBCategoryRows();

        
        // 4. Cargar Historiales y resto de filas (TMDB adaptado)
        loadPersonalizedRows();
        logDebug(`IDs cargados en DB: ${availableIds.size}`);
        
        // 3. Inicializar Páginas Específicas
        if (document.getElementById('favoritesGrid')) {
            loadMyList();
        }
        if (document.getElementById('searchResultsGrid')) {
            initSearchPage();
        }

        // 4. Detectar tipo de página para rows
        const isMoviesPage = document.body.classList.contains('page-movies');
        const isSeriesPage = document.body.classList.contains('page-series');
        const isAnimePage  = document.body.classList.contains('page-anime');
        const pageType     = (isSeriesPage || isAnimePage) ? 'tv' : (isMoviesPage ? 'movie' : 'all');

        // 4. Cargar Hero (Mezcla de Tendencias TMDB y Catálogo Propio)
        let heroData;
        if (isAnimePage) {
            heroData = await TMDB_SERVICE.fetchFromTMDB('/discover/tv', { with_genres: 16, sort_by: 'popularity.desc' });
        } else if (pageType === 'tv') {
            heroData = await TMDB_SERVICE.fetchFromTMDB('/trending/tv/day');
        } else if (pageType === 'movie') {
            heroData = await TMDB_SERVICE.fetchFromTMDB('/trending/movie/day');
        } else {
            heroData = await TMDB_SERVICE.getTrending();
        }

        // --- REVOLUCIÓN HERO: Mostrar tendencias de inmediato ---
        // Durante el arranque, permitimos mostrar items aunque la sincronización masiva no haya terminado
        let availableHeroItems = (heroData.results || []).filter(m => {
            if (!m.backdrop_path) return false;
            // Si ya terminó el sync, filtramos. Si no, mostramos los top para no dejar el Hero vacío.
            if (availableIds.size > 0 && !availableIds.has(m.id.toString())) return false;
            
            const itemType = m.media_type || (pageType === 'all' ? 'movie' : pageType);
            return validateContentType(m, itemType);
        });

        
        // Añadir items del catálogo local que tengan backdrop_url (Prioridad Alta)
        // Solo si coinciden con el tipo de la página
        const localHeroItems = (window.DB_CATALOG || []).filter(item => {
            if (!item.backdrop_url) return false;
            const itemType = item.content_type === 'series' ? 'tv' : 'movie';
            return validateContentType(item, itemType);
        }).slice(0, 5);
        
        // Combinar (Locales primero para dar visibilidad a la DB propia)
        let combinedHero = [...localHeroItems, ...availableHeroItems];
        heroItems = filterItemsByProfile(combinedHero).slice(0, 10);
        
        if (heroItems.length && document.getElementById('heroBanner')) {
            CATALOG_UI.renderHero(heroItems[0], heroItems);
            startHeroRotation();
            
            // VALIDACIÓN POST-RENDER: Verificar disponibilidad solo de lo que mostramos en el Hero
            validateBatchAvailability(supabase, heroItems.map(m => m.id));
        } else if (document.getElementById('heroBanner')) {
            // Si no hay nada, intentamos mostrar al menos un item de la DB sin backdrop_url
            const catalog = window.DB_CATALOG || [];
            if (catalog.length > 0) {
                CATALOG_UI.renderHero(catalog[0]);
            } else {
                document.getElementById('heroBanner').classList.add('hidden');
            }
        }

        // 5. Cargar Filas (Progresivas)
        const renderRow = async (containerId, fetchFn, type) => {
            const el = document.getElementById(containerId);
            if (!el) return;
            const data = await fetchFn();
            
            // FILTRO PROGRESIVO: Mostramos lo que TMDB nos da
            // Las insignias de "DISPONIBLE" se actualizarán solas gracias al evento batchLoaded
            let filtered = (data.results || []);
            filtered = filterItemsByProfile(filtered).slice(0, 20);

            if (filtered.length > 0) {
                CATALOG_UI.renderCarousel(containerId, filtered, type, availableIds);
                const section = el.closest('.catalog-row');
                if (section) section.classList.remove('hidden');

                // VALIDACIÓN BAJO DEMANDA: Verificar disponibilidad solo de esta fila
                validateBatchAvailability(supabase, filtered.map(m => m.id));
            }
        };

        if (pageType === 'all') {
            await Promise.all([
                // TOP 10 TRENDING (Netflix Style)
                (async () => {
                    const data = await TMDB_SERVICE.getTrending();
                    let filtered = (data.results || []);
                    filtered = filterItemsByProfile(filtered);
                    CATALOG_UI.renderTop10('trendingCarousel', filtered.slice(0, 10), availableIds, DB_CATALOG);
                })(),
                loadRecommendedItems(),
                renderRow('actionCarousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/movie', { with_genres: 28 }), 'movie'),
                renderRow('comedyCarousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/movie', { with_genres: 35 }), 'movie'),
                renderRow('horrorCarousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/movie', { with_genres: 27 }), 'movie'),
                renderRow('scifiCarousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/movie', { with_genres: 878 }), 'movie')
            ]);
        } else if (isAnimePage) {
            // MODO HÍBRIDO: Llamamos a TMDB para descubrir, pero filtramos por lo que hay en tu DB
            await Promise.all([
                renderHybridRow('popularCarousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/tv', { with_genres: 16, with_original_language: 'ja', sort_by: 'popularity.desc' }), 'tv'),
                renderHybridRow('topRatedCarousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/tv', { with_genres: 16, with_original_language: 'ja', sort_by: 'vote_average.desc', 'vote_count.gte': 50 }), 'tv'),
                renderHybridRow('genre1Carousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/tv', { with_genres: '16,10759', with_original_language: 'ja' }), 'tv'),
                renderHybridRow('genre2Carousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/tv', { with_genres: '16,10765', with_original_language: 'ja' }), 'tv'),
            ]);


        } else {
            // Películas o Series (Excluyendo Anime de Series)
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
        // 6. Cargar Grilla
        const gridContainer = document.getElementById('gridContainer');
        if (gridContainer) {
            await loadGridData(pageType, 1);
            const btnLoadMore = document.getElementById('btnLoadMore');
            if (btnLoadMore) {
                let currentPage = 1;
                btnLoadMore.onclick = async () => {
                    currentPage++;
                    await loadGridData(pageType, currentPage, true);
                };
            }
        }
    } catch (e) {
        console.error('[Dashboard] Error en inicialización:', e);
    }

    await loadMyList();
    await loadRecentlyWatched();
}

async function loadGridData(type, page, append = false) {
    const container = document.getElementById('gridContainer');
    const loader    = document.getElementById('gridLoader');
    const btnLoadMore = document.getElementById('btnLoadMore');
    if (!container) return;

    if (!append) container.innerHTML = '';
    if (loader) loader.classList.remove('hidden');

    try {
        // ---- FILTRO: SOLO DISPONIBLES ----
        // Si estamos en peliculas.html o series.html, cargamos solo de Supabase
        const isMoviesPage = document.body.classList.contains('page-movies');
        const isSeriesPage = document.body.classList.contains('page-series');
        const isAnimePage  = document.body.classList.contains('page-anime');

        if (isMoviesPage || isSeriesPage || isAnimePage) {
            // Cargar de TMDB para mostrar todo
            const data = type === 'tv' 
                ? await TMDB_SERVICE.getPopularTV(page)
                : await TMDB_SERVICE.getPopularMovies(page);

            if (loader) loader.classList.add('hidden');

            let filteredItems = (data.results || []);
            filteredItems = filterItemsByProfile(filteredItems);

            // Para anime, filtrar por género 16
            if (isAnimePage) {
                filteredItems = filteredItems.filter(item => (item.genre_ids || []).includes(16));
            }

            const fragment = document.createDocumentFragment();
            filteredItems.forEach(item => {
                const card = CATALOG_UI.createMovieCard(item, type, true);
                fragment.appendChild(card);
            });
            container.appendChild(fragment);

            if (btnLoadMore) btnLoadMore.classList.toggle('hidden', filteredItems.length < 20); // Asumir 20 por página
            return;
        }

        // ---- MODO NORMAL: POPULARES TMDB ----
        const data = type === 'tv' 
            ? await TMDB_SERVICE.getPopularTV(page)
            : await TMDB_SERVICE.getPopularMovies(page);

        if (loader) loader.classList.add('hidden');
        
        if (data.results?.length) {
            const fragment = document.createDocumentFragment();
            data.results.forEach(item => {
                if (!item.poster_path) return;
                const isAvail = window.availableIds?.has(item.id.toString());
                const card = CATALOG_UI.createMovieCard(item, type, isAvail);
                fragment.appendChild(card);
            });
            container.appendChild(fragment);
        }
    } catch (e) {
        console.error('Error cargando grid:', e);
        if (loader) loader.classList.add('hidden');
    }
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

// --- MOTOR DE LATIDOS (Fase 12: Sesión Estricta por Servidor) ---
async function startHeartbeat() {
    if (!supabase || !currentProfile) return;
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    const sendPulse = async () => {
        try {
            await supabase.rpc('vivotv_heartbeat', { pid: currentProfile.id });
        } catch(e) { console.warn('[VivoTV] Heartbeat error:', e); }
    };

    sendPulse();
    heartbeatTimer = setInterval(sendPulse, 10000); // Latido cada 10s

    // Suscripción Realtime para Detección de Expulsión (Fase Broadcast 10X)
    subscribeToSessionChanges();

    // Iniciar chequeo de concurrencia regular (cada 1 min)
    setInterval(checkConcurrentSessions, 60000);
}

// ================================================
// SEGURIDAD: CONTROL DE SESIONES CONCURRENTES (Fase 3)
// ================================================
async function checkConcurrentSessions() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        let deviceId = localStorage.getItem('vivotv_device_id');
        if (!deviceId) {
            deviceId = crypto.randomUUID();
            localStorage.setItem('vivotv_device_id', deviceId);
        }

        // Registrar sesión actual (Silencioso) - Fase Fix: onConflict para evitar 409
        const { error: upsertError } = await supabase.from('active_sessions').upsert(
            {
                user_id: user.id,
                device_id: deviceId,
                last_seen: new Date().toISOString() // Esquema usa last_seen
            },
            { onConflict: 'user_id, device_id' }
        );

        if (upsertError) {
            if (upsertError.code === '42P01') {
                console.warn('[VivoTV] Por favor, ejecuta el script SQL provisto en Supabase para habilitar el control de dispositivos.');
            }
            return; // No bloqueamos la app si falta la tabla
        }

        // Contar sesiones activas de los últimos 2 minutos
        const twoMinAgo = new Date(Date.now() - 120000).toISOString();
        const { data: sessions, error } = await supabase.from('active_sessions')
            .select('*')
            .eq('user_id', user.id)
            .gt('last_seen', twoMinAgo)
            .order('last_seen', { ascending: false });

        if (error) return;

        if (sessions && sessions.length > 2) {
            const isAuthorized = sessions.slice(0, 2).some(s => s.device_id === deviceId);
            if (!isAuthorized) {
                showToast('Límite de 2 dispositivos alcanzado. Cerrando sesión.');
                setTimeout(() => {
                    supabase.auth.signOut();
                    sessionStorage.clear();
                    window.location.href = 'index.html';
                }, 3000);
            }
        }
    } catch (e) {
        console.error('[Session Guard Error]:', e);
    }
}

async function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    
    if (sessionChannel) {
        supabase.removeChannel(sessionChannel);
        sessionChannel = null;
    }

    if (currentProfile && supabase) {
        await supabase.rpc('vivotv_release_session', { pid: currentProfile.id });
    }
}

// --- SISTEMA DE EXPULSIÓN (Fase 16: Realtime) ---
function subscribeToSessionChanges() {
    if (!supabase || !currentProfile) return;

    if (sessionChannel) supabase.removeChannel(sessionChannel);

    sessionChannel = supabase
        .channel(`session-${currentProfile.id}`)
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'vivotv_profiles',
            filter: `id=eq.${currentProfile.id}`
        }, (payload) => {
            const { last_heartbeat } = payload.new;
            if (last_heartbeat === null) {
                console.warn('[VivoTV] Sesión finalizada remotamente.');
                handleRemoteLogout();
            }
        })
        .subscribe();
}

function handleRemoteLogout() {
    stopHeartbeat();
    showToast("⚠️ Tu sesión ha sido finalizada desde otro dispositivo.", "error", 5000);
    setTimeout(() => {
        window.location.href = 'profiles.html';
    }, 2000);
}

// Re-verificar sesión al volver a la pestaña (por si Realtime se pausó)
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && currentProfile) {
        const { data } = await supabase
            .from('vivotv_profiles')
            .select('last_heartbeat')
            .eq('id', currentProfile.id)
            .maybeSingle();
        
        if (data && data.last_heartbeat === null) {
            handleRemoteLogout();
        }
    }
});

// Escuchar cierre de pestaña para liberar inmediatamente
window.addEventListener('beforeunload', stopHeartbeat);
window.addEventListener('pagehide', stopHeartbeat); // Más fiable en móviles

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
    const { data: { user } } = await supabase.auth.getUser();
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
        
        // Show skeletons while loading details
        CATALOG_UI.showSkeletons('favoritesGrid', 8);

        favoritesGrid.innerHTML = '';
        
        // Cargar detalles y renderizar en la grilla
        for (const item of favs) {
            const details = await TMDB_SERVICE.getDetails(item.tmdb_id, item.type || 'movie').catch(() => null);
            if (!details) continue;
            const isAvail = availableIds.has(item.tmdb_id.toString()) || availableIds.has(item.tmdb_id);
            const card = CATALOG_UI.createMovieCard(details, item.type || 'movie', isAvail);
            favoritesGrid.appendChild(card);
        }
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
        currentProfile = JSON.parse(sessionStorage.getItem('vivotv_current_profile'));
    }
    if (!currentProfile) return;

    const { data: { user } } = await supabase.auth.getUser();
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
        currentProfile = JSON.parse(sessionStorage.getItem('vivotv_current_profile'));
    }
    if (!currentProfile) return;

    const { data: { user } } = await supabase.auth.getUser();
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

    const results = await Promise.all(unique.map(item => 
        TMDB_SERVICE.getDetails(item.tmdb_id, item.type)
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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Obtener últimas visualizaciones únicas
        const { data: history } = await supabase.from('watch_history')
            .select('tmdb_id, type')
            .eq('user_id', user.id)
            .eq('profile_id', currentProfile.id)
            .order('last_watched', { ascending: false })
            .limit(5);

        if (!history || history.length === 0) {
            section.classList.add('hidden');
            return;
        }

        // 2. Obtener recomendaciones de TMDB para cada uno
        const recommendationPromises = history.map(h => 
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
        currentProfile = JSON.parse(sessionStorage.getItem('vivotv_current_profile'));
    }
    if (!currentProfile) return;

    const { data: { user } } = await supabase.auth.getUser();
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

    const details = await Promise.all(unique.map(item => 
        TMDB_SERVICE.getDetails(item.tmdb_id, item.type)
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

document.addEventListener('DOMContentLoaded', () => initAuth());

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

    // Resetear estado global de inicialización para permitir re-carga en SPA
    isDashboardInit = false;

    // Detener rotaciones e intervalos previos para evitar desbordamiento de memoria
    stopHeroRotation();
    if (heartbeatTimer) clearInterval(heartbeatTimer);

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
        // En cada cambio de página, re-asignamos listeners a elementos que podrían ser nuevos
        setupAuthListeners();
        initAuth();
    } catch(e) { fatalLog('Error crítico en inicialización SPA: ' + e.message); }

    // 3. Cargar lógica específica
    if (path.includes('historial.html')) {
        loadFullHistory();
    }

    // Configurar event listeners que dependen de referencias DOM
    if (exitModal) {
        window.addEventListener('click', (e) => {
            if (e.target === exitModal) {
                exitModal.classList.remove('active');
                document.body.classList.remove('no-scroll');
            }
        });
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
        document.addEventListener('click', (e) => {
            if (searchBox && !searchBox.contains(e.target)) {
                searchBox.classList.remove('active');
            }
        });
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

    // Actualizar flechas de carruseles si existen
    document.querySelectorAll('.carousel').forEach(updateCarouselArrows);
}

// Escuchar cambios de página vía SPA (desde layout.js)
window.addEventListener('vivotv:page-changed', initAppForPage);

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

// Sincronización continua de bajo impacto (Solo cada 2 minutos)
setInterval(async () => {
    try {
        console.log('[VivoTV] 🔄 Iniciando refresh de catálogo en segundo plano...');
        await fetchAvailableIds(); 
    } catch (e) {
        console.warn('Error actualizando disponibles:', e);
    }
}, 120000); // 2 minutos para no saturar

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
