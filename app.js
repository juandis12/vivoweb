// ---- VIVOTV APP CORE (ORCHESTRATOR) ----
import { CONFIG } from './config.js';
import { TMDB_SERVICE } from './tmdb.js';
import { PLAYER_LOGIC, setSupabase } from './player.js';
import { showToast } from './utils.js';

// ---- MODULAR SERVICES ----
import { initAuth, supabase, currentProfile, startHeartbeat, stopHeartbeat, checkConcurrentSessions } from './auth.js';
import { CATALOG_UI, UI_EFFECTS } from './ui.js';
import { 
    fetchAvailableIds, loadGridData, renderDBCatalog, 
    validateContentType, filterItemsByProfile, 
    availableIds, DB_CATALOG,
    loadMyList, loadRecommendedItems, loadRecentlyWatched, executeSearch
} from './catalog.js';

// ---- STATE ----
let isDashboardInit = false;
let heroItems = [];
let heroRotationTimer = null;
let searchTimeout = null;

// ---- DOM REFERENCES ----
const getEl = (id) => document.getElementById(id);
const authSection = getEl('authSection');
const dashSection = getEl('dashboardSection');
const userNameEl = getEl('userName');
const userAvatar = getEl('userAvatar');
const mainNav = getEl('mainNav');
const mobileNav = document.querySelector('.mobile-nav');

/**
 * Re-inicialización de la página (Fix Alt+F5 / SPA Navigation)
 */
async function initAppForPage() {
    console.log(`[VivoTV] Inicializando página: ${window.location.pathname}`);
    
    // 0. Resetear estados locales para permitir re-renderizado
    setupAuthListeners();
    isDashboardInit = false;
    stopHeroRotation();
    
    // 1. Detección Preventiva de Perfil (Fase Antigravedad)
    const storedProfile = localStorage.getItem('vivotv_current_profile');
    const isAuthPage = window.location.pathname.includes('profiles.html');
    
    if (storedProfile && !isAuthPage) {
        console.log('[VivoTV] Perfil detectado localmente, forzando visibilidad del Dashboard...');
        if (dashSection) dashSection.classList.remove('hidden');
        if (authSection) authSection.classList.add('hidden');
    }

    // 2. Asegurar que Supabase esté listo y detectar sesión
    const { user, profile } = await initAuth(onAuthStatusChange);
    
    if (!user) {
        console.warn('[VivoTV] No se encontró sesión de usuario, activando Auth.');
        toAuth();
        return;
    }

    // 3. Inicializar Dashboard con datos validados
    await toDashboard(user, profile);
}

/**
 * Manejador de cambios de autenticación
 */
function onAuthStatusChange(event, session, profile) {
    console.log(`[VivoTV] onAuthStatusChange: ${event}`);

    if (event === 'INITIAL_SESSION' && !session) {
        console.log('[VivoTV] Esperando recuperación de sesión real...');
        return;
    }

    if (!session) {
        // Pequeño retardo de seguridad para evitar falsos deslogueos durante hidratación 
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
            toAuth();
        }
    } else if (profile) {
        if (!isDashboardInit) toDashboard(session.user, profile);
    }
}

/**
 * Configuración del Dashboard
 */
async function toDashboard(user, profileIfKnown) {
    if (isDashboardInit) {
        // Si ya está iniciado pero profileIfKnown es distinto, actualizamos datos
        return;
    }
    
    // Prioridad al perfil pasado por argumento o el global de auth
    const profile = profileIfKnown || currentProfile;

    if (!profile) {
        if (!window.location.pathname.includes('profiles.html')) {
            console.log('[VivoTV] No hay perfil seleccionado, redirigiendo a profiles.html');
            window.location.replace('profiles.html');
        }
        return;
    }

    console.log(`[VivoTV] Renderizando Dashboard para: ${profile.name}`);
    
    // Sincronizar estado local de app.js
    currentProfile = profile; 
    isDashboardInit = true; 

    // Sync UI with Profile
    if (userNameEl) userNameEl.textContent = currentProfile.name;
    if (userAvatar) {
        userAvatar.textContent = currentProfile.name[0];
        userAvatar.className = `avatar ${currentProfile.color}`;
    }

    if (mainNav) mainNav.classList.remove('hidden');
    if (mobileNav) mobileNav.classList.remove('hidden');

    // --- VISIBILIDAD ATÓMICA DEFINITIVA ---
    if (authSection) {
        authSection.classList.add('hidden');
        authSection.setAttribute('hidden', 'true');
    }
    if (dashSection) {
        dashSection.classList.remove('hidden');
        dashSection.removeAttribute('hidden');
    }

    // Ocultar Splash si existe
    const splash = document.getElementById('splashScreen');
    if (splash) splash.classList.add('hidden');

    // Sync state and rendering
    setSupabase(supabase);
    await fetchAvailableIds(supabase);
    
    startHeartbeat();
    checkConcurrentSessions();

    await renderInterface();
}

/**
 * Renderizado de la Interfaz según la página actual
 */
async function renderInterface() {
    const isMoviesPage = document.body.classList.contains('page-movies');
    const isSeriesPage = document.body.classList.contains('page-series');
    const isAnimePage  = document.body.classList.contains('page-anime');
    const pageType     = (isSeriesPage || isAnimePage) ? 'tv' : (isMoviesPage ? 'movie' : 'all');

    // 1. Hero Banner
    await loadHero(pageType, isAnimePage);

    // 2. Rows / Carruseles
    if (pageType === 'all') {
        try {
            const trending = await TMDB_SERVICE.getTrending();
            const results = filterItemsByProfile(trending.results, currentProfile);
            CATALOG_UI.renderTop10('trendingCarousel', results.slice(0, 10), availableIds);
        } catch (e) { console.error('Error trending:', e); }
        
        loadPersonalizedSections();
        
        await renderDBCatalog('popularMoviesCarousel', 'movie');
        await renderDBCatalog('popularTVCarousel', 'series');
    } else {
        await loadCategoryRows(pageType, isAnimePage);
    }

    // 3. Rejilla (Grid) de contenido
    const gridContainer = getEl('gridContainer');
    if (gridContainer) {
        await loadGridData(pageType, 1, false, currentProfile);
        const btnMore = getEl('btnLoadMore');
        if (btnMore) {
            let currentPage = 1;
            btnMore.onclick = async () => {
                currentPage++;
                await loadGridData(pageType, currentPage, true, currentProfile);
            };
        }
    }
}

/**
 * Carga del Hero dinámico
 */
async function loadHero(pageType, isAnime) {
    let heroData;
    try {
        if (isAnime) {
            heroData = await TMDB_SERVICE.fetchFromTMDB('/discover/tv', { with_genres: 16, sort_by: 'popularity.desc' });
        } else if (pageType === 'tv') {
            heroData = await TMDB_SERVICE.fetchFromTMDB('/trending/tv/day');
        } else if (pageType === 'movie') {
            heroData = await TMDB_SERVICE.fetchFromTMDB('/trending/movie/day');
        } else {
            heroData = await TMDB_SERVICE.getTrending();
        }

        const trends = (heroData.results || []).filter(m => {
            return m.backdrop_path && validateContentType(m, m.media_type || pageType);
        });

        const locals = DB_CATALOG.filter(item => {
            return item.backdrop_url && validateContentType(item, item.content_type === 'series' ? 'tv' : 'movie');
        }).slice(0, 5);

        heroItems = filterItemsByProfile([...locals, ...trends], currentProfile).slice(0, 10);
        
        if (heroItems.length && getEl('heroBanner')) {
            CATALOG_UI.renderHero(heroItems[0], heroItems);
            startHeroRotation();
        }
    } catch (e) { console.error('Error hero:', e); }
}

function startHeroRotation() {
    stopHeroRotation();
    if (!heroItems.length) return;
    let idx = 0;
    heroRotationTimer = setInterval(() => {
        idx = (idx + 1) % heroItems.length;
        CATALOG_UI.renderHero(heroItems[idx], heroItems);
    }, 8000);
}

function stopHeroRotation() {
    if (heroRotationTimer) clearInterval(heroRotationTimer);
}

async function loadCategoryRows(pageType, isAnime) {
    const rows = [
        { id: 'popularCarousel',  fetch: () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { sort_by: 'popularity.desc', ...(isAnime ? {with_genres:16,with_original_language:'ja'} : {without_genres:16}) }) },
        { id: 'topRatedCarousel', fetch: () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { sort_by: 'vote_average.desc', 'vote_count.gte': 100, ...(isAnime ? {with_genres:16,with_original_language:'ja'} : {without_genres:16}) }) },
        { id: 'genre1Carousel',   fetch: () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { with_genres: pageType==='tv'?10759:28, ...(isAnime ? {with_original_language:'ja'} : {without_genres:16}) }) }
    ];

    await Promise.all(rows.map(async row => {
        try {
            const data = await row.fetch();
            const results = filterItemsByProfile(data.results, currentProfile);
            CATALOG_UI.renderCarousel(row.id, results, pageType, availableIds);
        } catch (e) { console.warn(`Error row ${row.id}:`, e); }
    }));
}

async function loadPersonalizedSections() {
    const recs = await loadRecommendedItems(supabase, currentProfile, availableIds);
    if (recs && recs.length) CATALOG_UI.renderCarousel('recommendedCarousel', recs, null, availableIds);
    
    const favorites = await loadMyList(supabase, currentProfile, availableIds);
    if (favorites && favorites.length) CATALOG_UI.renderCarousel('myListCarousel', favorites, null, availableIds);
    
    await loadRecentlyWatched(supabase, currentProfile);
}

function toAuth() {
    if (authSection) authSection.classList.remove('hidden');
    if (dashSection) dashSection.classList.add('hidden');
    TMDB_SERVICE.getImagesForAuthBg().then(CATALOG_UI.renderAuthBg);
}

// ---- EVENT LISTENERS ----
window.addEventListener('vivotv:page-changed', initAppForPage);
window.addEventListener('vivotv:remote-logout', () => {
    showToast("⚠️ Sesión finalizada remotamente.", "error");
    setTimeout(() => window.location.href = 'profiles.html', 2000);
});

// Play/Detail Event
window.addEventListener('open-movie-detail', (e) => {
    PLAYER_LOGIC.openDetail(e.detail.tmdbId, e.detail.type, supabase, availableIds);
});

// UI Effects
document.addEventListener('DOMContentLoaded', () => {
    UI_EFFECTS.initNavbarScroll();
    UI_EFFECTS.initMobileNavIndicator();
    initAppForPage();
});

// Carousel Arrows
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.carousel-arrow');
    if (!btn) return;
    const carousel = btn.closest('.carousel-wrapper')?.querySelector('.carousel');
    if (!carousel) return;
    const dir = btn.classList.contains('carousel-arrow-left') ? -1 : 1;
    carousel.scrollBy({ left: dir * carousel.clientWidth * 0.8, behavior: 'smooth' });
});

// Search Logic
const searchInput = getEl('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        if (searchTimeout) clearTimeout(searchTimeout);
        if (q.length < 3) return;
        searchTimeout = setTimeout(async () => {
            const results = await executeSearch(q, currentProfile, availableIds);
            const isMoviesPage = document.body.classList.contains('page-movies');
            const targetId = isMoviesPage ? 'popularCarousel' : 'trendingCarousel';
            CATALOG_UI.renderCarousel(targetId, results, null, availableIds, `🔍 Resultados para "${q}"`);
        }, 400);
    });
}

/**
 * Listeners para Formularios de Autenticación
 */
function setupAuthListeners() {
    const loginForm = getEl('loginForm');
    if (!loginForm) return;

    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const emailEl = getEl('email');
        const passwordEl = getEl('password');
        const redirectMsg = getEl('authRedirect');

        if (!emailEl || !passwordEl) {
            console.error('[VivoTV] No se encontraron campos de login en el DOM.');
            showToast('Error interno: Campos de login no encontrados.', 'error');
            return;
        }

        const email = emailEl.value.trim();
        const password = passwordEl.value;
        const btnSubmit = getEl('btnSubmit');
        const btnText = getEl('btnText');
        const btnLoader = getEl('btnLoader');
        const authError = getEl('authError');

        if (!email || !password) {
            showToast('Por favor, completa todos los campos.', 'error');
            return;
        }

        UI_EFFECTS.setLoading(true, btnText, btnLoader, btnSubmit);
        if (authError) authError.classList.add('hidden');
        if (redirectMsg) redirectMsg.classList.add('hidden');

        try {
            const isLogin = !window.location.pathname.includes('registro.html');
            if (isLogin) {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                
                if (redirectMsg) {
                    redirectMsg.textContent = "🚀 Autenticado. Redirigiendo...";
                    redirectMsg.classList.remove('hidden');
                }
                
                // Redirección inmediata a perfiles
                window.location.replace('profiles.html');
            } else {
                const username = getEl('username')?.value.trim() || 'Usuario';
                const { error } = await supabase.auth.signUp({ 
                    email, password, options: { data: { name: username } } 
                });
                if (error) throw error;
                showToast('📩 Revisa tu correo para activar la cuenta.', 'success');
            }
        } catch (err) {
            console.error('[VivoTV] Error en Auth:', err);
            if (authError) {
                authError.textContent = err.message || 'Error al conectar con el servidor.';
                authError.classList.remove('hidden');
            }
            showToast(err.message, 'error');
        } finally {
            UI_EFFECTS.setLoading(false, btnText, btnLoader, btnSubmit);
        }
    };

    const btnTogglePass = getEl('btnTogglePass');
    const passInput = getEl('password');
    if (btnTogglePass && passInput) {
        btnTogglePass.onclick = () => {
            passInput.type = passInput.type === 'password' ? 'text' : 'password';
        };
    }
}
