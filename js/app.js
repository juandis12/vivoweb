/* ============================================================================
   VivoTV - Core Application Orchestrator
   Modular v3.0 (Zero-Spaghetti Architecture)
   ============================================================================ */

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
    DB_CATALOG,
    loadGridData
} from './catalog.js';

import { AuthService } from './services/AuthService.js';
import { WatchPartyGuide } from './watch-party-guide.js';
import { AchievementsEngine } from './achievements.js';
import { SocialPulse } from './social-pulse.js';
import { startHeartbeat, stopHeartbeat, checkConcurrentSessions } from './auth.js';

// Modular Subsystems
import { 
    initNavbarScroll, 
    initMobileNavIndicator, 
    initMagicSlide, 
    initMagneticHover, 
    hideSplashScreen, 
    setLoading, 
    setLoadingLogout, 
    setupExitModalListeners 
} from './modules/navigation-ui.js';

import { 
    initCarouselInertia, 
    updateCarouselArrows 
} from './modules/carousel-controller.js';

import { 
    initSearchPage, 
    executeSearch, 
    initNavbarSearch, 
    initMoodChips 
} from './modules/search-controller.js';

import { 
    loadMyList, 
    loadRecentlyWatched, 
    loadPersonalizedRows, 
    loadRecommendedItems, 
    loadFullHistory, 
    getActiveProfile 
} from './modules/user-lists.js';

import { 
    toAuth, 
    toLoginMode, 
    toForgotPasswordMode, 
    showResetPasswordForm, 
    handleAuthAction, 
    setupAuthListeners 
} from './modules/auth-ui.js';

import { initBrandHubs } from './modules/brand-hubs.js';

// Global singletons & diagnostics
window.SOCIAL_PULSE = SocialPulse;
window.ACHIEVEMENTS = AchievementsEngine;
window.VIVOTV_TOGGLE_FAVORITE = (tmdbId, type, btn) => PLAYER_LOGIC.toggleFavorite(supabase, tmdbId, type, btn);
window.VIVOTV_VIEWING_STATUS = null;
window.VIVOTV_FAVORITES = new Set();

const fatalLog = (msg) => {
    if (typeof window.fatalLog === 'function') {
        window.fatalLog(msg);
    } else {
        console.log(`[VivoTV] ${msg}`);
    }
};

if (supabase) {
    setSupabase(supabase);
}

// State
let currentProfile = null;
let heroItems = [];
let heroRotationTimer = null;
let heroCurrentIndex = 0;
let isPopulating = false;
let pendingPartyId = new URLSearchParams(window.location.search).get('party') || sessionStorage.getItem('vivotv_pending_party_id');
if (pendingPartyId === 'null') pendingPartyId = null;
if (pendingPartyId) sessionStorage.setItem('vivotv_pending_party_id', pendingPartyId);

/**
 * Updates avatar and profile name in top navigation
 */
export function updateProfileUI() {
    currentProfile = getActiveProfile(currentProfile);
    if (!currentProfile) return;

    const profileContainer = document.getElementById('userProfile');
    const userNameElement = document.getElementById('userName');
    const userAvatarElement = document.getElementById('userAvatar');

    if (profileContainer) profileContainer.classList.remove('hidden');
    if (userNameElement) userNameElement.textContent = currentProfile.name;
    if (userAvatarElement) {
        if (currentProfile.avatar_url) {
            userAvatarElement.textContent = '';
            userAvatarElement.className = 'avatar';

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

/**
 * Sets up button listeners for "Ver más"
 */
function setupVerMasButtons() {
    const buttons = document.querySelectorAll('.btn-ver-mas');
    const gridHeader = document.querySelector('.grid-header') || document.getElementById('gridContainer');
    if (!buttons.length || !gridHeader) return;

    buttons.forEach(btn => {
        if (btn.dataset.hasListener) return;
        btn.onclick = (e) => {
            e.preventDefault();
            gridHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        btn.dataset.hasListener = "true";
    });
}

/**
 * Hero Rotation system
 */
function startHeroRotation() {
    if (!heroItems.length || !document.getElementById('heroBanner')) return;
    stopHeroRotation();
    heroRotationTimer = setInterval(() => {
        heroCurrentIndex = (heroCurrentIndex + 1) % heroItems.length;
        CATALOG_UI.renderHero(heroItems[heroCurrentIndex], heroItems);
    }, 8000);
}

function stopHeroRotation() {
    if (heroRotationTimer) {
        clearInterval(heroRotationTimer);
        heroRotationTimer = null;
    }
}

/**
 * Anime Dashboard Rows renderer
 */
async function renderAnimeDashboardRows(availIds) {
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

/**
 * Renders database category rows
 */
export async function renderDBCategoryRows() {
    const isMainPage = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
    const isMoviePage = window.location.pathname.includes('peliculas.html');
    const isSeriesPage = window.location.pathname.includes('series.html');
    const isAnimePage = window.location.pathname.includes('anime.html');

    try {
        if (isMainPage) {
            await Promise.all([
                renderDBCatalog('categoryMoviesCarousel', 'movie'),
                renderDBCatalog('categorySeriesCarousel', 'series'),
                renderDBCatalog('categoryAnimeCarousel', 'all', true)
            ]);
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

/**
 * Populates current page with dynamic hero and category carousels
 */
async function populatePageContent() {
    updateProfileUI();
    currentProfile = getActiveProfile(currentProfile);
    
    if (!currentProfile || isPopulating) return;
    isPopulating = true;
    
    try {
        // Sync catalog and favorites in parallel
        const [catalogResult, favoritesResult] = await Promise.allSettled([
            syncCatalog(supabase),
            currentProfile ? supabase.from('user_favorites').select('tmdb_id').eq('profile_id', currentProfile.id) : Promise.resolve({ data: [] })
        ]);

        if (favoritesResult.status === 'fulfilled' && favoritesResult.value.data) {
            window.VIVOTV_FAVORITES = new Set(favoritesResult.value.data.map(f => f.tmdb_id.toString()));
        }

        if (document.body.classList.contains('page-live') || window.location.pathname.includes('live.html')) {
            return;
        }
    
        if (window.location.hash !== '#linkMyList') window.scrollTo(0, 0);

        const carouselIds = [
            'top10MoviesCarousel', 'trendingCarousel', 'popularMoviesCarousel', 'topRatedCarousel', 'popularTVCarousel',
            'actionCarousel', 'comedyCarousel', 'dramaCarousel', 'horrorCarousel',
            'popularCarousel', 'genre1Carousel', 'genre2Carousel', 'genre3Carousel', 'genre4Carousel',
            'recommendedCarousel'
        ];
        carouselIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });

        const allSections = [
            'top10MoviesSection', 'trendingSection', 'popularSection', 'topRatedSection', 
            'actionSection', 'comedySection', 'horrorSection', 'scifiSection', 
            'recommendedSection', 'recentSection', 'myListSection', 'popularMoviesSection', 'popularTVSection'
        ];
        allSections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

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

        renderDBCategoryRows();
        loadPersonalizedRows({ supabase, currentProfile, availableIds, CATALOG_UI, TMDB_SERVICE, DB_CATALOG });
        
        if (document.getElementById('favoritesGrid')) {
            loadMyList({ supabase, currentProfile, availableIds, CATALOG_UI, TMDB_SERVICE, DB_CATALOG });
        }
        if (document.getElementById('searchResultsGrid')) {
            initSearchPage((q) => executeSearch(q, { TMDB_SERVICE, filterItemsByProfile, availableIds, CATALOG_UI }));
        }

        const isMoviesPage = document.body.classList.contains('page-movies');
        const isSeriesPage = document.body.classList.contains('page-series');
        const isAnimePage  = document.body.classList.contains('page-anime');
        const pageType     = (isSeriesPage || isAnimePage) ? 'tv' : (isMoviesPage ? 'movie' : 'all');

        // Hero discovery
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

        let availableHeroItems = (heroData?.results || []).filter(m => {
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

        const renderRow = async (containerId, fetchFn, type) => {
            const el = document.getElementById(containerId);
            if (!el) return;
            const data = await fetchFn();
            let filtered = filterItemsByProfile(data?.results || []).slice(0, 20);
            if (filtered.length > 0) {
                CATALOG_UI.renderCarousel(containerId, filtered, type, availableIds);
                const section = el.closest('.catalog-row');
                if (section) section.classList.remove('hidden');
            }
        };

        if (pageType === 'all') {
            await Promise.all([
                // 1. Las 10 películas más populares en Colombia hoy
                (async () => {
                    const data = await TMDB_SERVICE.fetchFromTMDB('/trending/movie/day', { region: 'CO' });
                    let filtered = filterItemsByProfile(data?.results || []);
                    CATALOG_UI.renderTop10('top10MoviesCarousel', filtered.slice(0, 10), availableIds, window.DB_CATALOG);
                    const sec = document.getElementById('top10MoviesSection');
                    if (sec && filtered.length > 0) sec.classList.remove('hidden');
                })(),
                // 2. Las 10 series más populares en Colombia hoy
                (async () => {
                    const data = await TMDB_SERVICE.fetchFromTMDB('/trending/tv/day', { region: 'CO' });
                    let filtered = filterItemsByProfile(data?.results || []);
                    CATALOG_UI.renderTop10('trendingCarousel', filtered.slice(0, 10), availableIds, window.DB_CATALOG);
                    const sec = document.getElementById('trendingSection');
                    if (sec && filtered.length > 0) sec.classList.remove('hidden');
                })(),
                loadRecommendedItems({ supabase, currentProfile, availableIds, CATALOG_UI, TMDB_SERVICE, DB_CATALOG, filterItemsByProfile }),
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
            
            const renderDedicatedTop10 = async () => {
                if (pageType === 'movie' && document.getElementById('top10MoviesCarousel')) {
                    const data = await TMDB_SERVICE.fetchFromTMDB('/trending/movie/day', { region: 'CO' });
                    let filtered = filterItemsByProfile(data?.results || []);
                    CATALOG_UI.renderTop10('top10MoviesCarousel', filtered.slice(0, 10), availableIds, window.DB_CATALOG);
                    const sec = document.getElementById('top10MoviesSection');
                    if (sec && filtered.length > 0) sec.classList.remove('hidden');
                } else if (pageType === 'tv' && document.getElementById('trendingCarousel')) {
                    const data = await TMDB_SERVICE.fetchFromTMDB('/trending/tv/day', { region: 'CO' });
                    let filtered = filterItemsByProfile(data?.results || []);
                    CATALOG_UI.renderTop10('trendingCarousel', filtered.slice(0, 10), availableIds, window.DB_CATALOG);
                    const sec = document.getElementById('trendingSection');
                    if (sec && filtered.length > 0) sec.classList.remove('hidden');
                }
            };

            await Promise.all([
                renderDedicatedTop10(),
                renderRow('popularCarousel', fetchPopular, pageType),
                renderRow('topRatedCarousel', fetchTop, pageType),
                renderRow('genre1Carousel', () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { with_genres: pageType==='tv'?10759:28, ...(pageType==='tv'?{without_genres:16}:{}) }), pageType),
                renderRow('genre2Carousel', () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { with_genres: 35, ...(pageType==='tv'?{without_genres:16}:{}) }), pageType),
                renderRow('genre3Carousel', () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { with_genres: pageType==='tv'?18:10749, ...(pageType==='tv'?{without_genres:16}:{}) }), pageType),
                renderRow('genre4Carousel', () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { with_genres: pageType==='tv'?10765:27, ...(pageType==='tv'?{without_genres:16}:{}) }), pageType),
            ]);
        }
        
        await loadGridData(pageType, 1, false, currentProfile);
        setupVerMasButtons();
        await loadMyList({ supabase, currentProfile, availableIds, CATALOG_UI, TMDB_SERVICE, DB_CATALOG });
        await loadRecentlyWatched({ supabase, currentProfile, CATALOG_UI, TMDB_SERVICE });
    } catch (e) {
        console.error('[SPA Engine] Error poblando contenido:', e);
    } finally {
        isPopulating = false;
    }
}

/**
 * Transitions view into authenticated dashboard state
 */
async function toDashboard(user, profile) {
    if (!user) return;
    
    const authSection = document.getElementById('authSection');
    const dashSection = document.getElementById('dashboardSection');
    const mainNav = document.getElementById('mainNav');
    const mobileNav = document.querySelector('.mobile-nav');
    const searchBox = document.getElementById('searchBox');
    const userProfile = document.getElementById('userProfile');

    if (authSection) authSection.classList.add('hidden');
    if (dashSection) dashSection.classList.remove('hidden');
    if (mainNav) mainNav.classList.remove('hidden');
    if (mobileNav) mobileNav.classList.remove('hidden');
    if (searchBox) searchBox.classList.remove('hidden');

    currentProfile = profile || getActiveProfile();

    if (!currentProfile) {
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
                setupExitModalListeners(supabase);
                initBrandHubs();
            } else {
                toAuth(TMDB_SERVICE, CATALOG_UI);
            }
        };
    }

    try {
        startHeartbeat();
        checkConcurrentSessions();
        await populatePageContent();

        if (pendingPartyId) {
            const capturedPartyId = pendingPartyId;
            import('./watch-party-ui.js').then(module => {
                module.joinPartyFromUrl(capturedPartyId);
            }).catch(e => console.error('[App] Error al cargar Watch Party UI:', e));
            pendingPartyId = null;
            sessionStorage.removeItem('vivotv_pending_party_id');
        }

        const _profileId = currentProfile?.id;
        if (_profileId) {
            AchievementsEngine.init(supabase, _profileId).catch(e =>
                console.warn('[App] Achievements Engine no disponible:', e)
            );
            SocialPulse.init(supabase, _profileId);
            import('./ambient-fx.js').then(m => m.AmbientGlow?.init?.()).catch(() => {});
            import('./vibe-engine.js').then(m => m.VibeEngine?.init?.()).catch(() => {});
        }

        const btnSurprise = document.getElementById('btnSurprise');
        if (btnSurprise) {
            btnSurprise.onclick = (e) => {
                e.preventDefault();
                const all = window.DB_CATALOG || [];
                if (all.length > 0) {
                    const random = all[Math.floor(Math.random() * all.length)];
                    const id = random.tmdb_id || random.id;
                    const type = random.content_type || (random.media_type === 'tv' ? 'tv' : 'movie');
                    PLAYER_LOGIC.openDetail(id, type, supabase);
                    showToast('🎬 ¡Aquí tienes algo especial!', 'success');
                }
            };
        }

        window.dispatchEvent(new CustomEvent('vivotv:dashboard-ready', {
            detail: { profile: currentProfile }
        }));

    } catch (e) {
        console.error('[Dashboard] Error en inicialización:', e);
    }
}

/**
 * Initializes and binds page specific controls (Search, History, Hero buttons)
 */
function initAppForPage() {
    const path = window.location.pathname;

    stopHeroRotation();
    stopHeartbeat();

    setupAuthListeners({ supabase, setLoading });

    if (path.includes('historial.html')) {
        loadFullHistory({ supabase, currentProfile, CATALOG_UI, TMDB_SERVICE });
    }

    setupExitModalListeners(supabase);

    const btnPass = document.getElementById('btnTogglePass');
    const passwordEl = document.getElementById('password');
    if (btnPass && passwordEl) {
        btnPass.onclick = () => {
            passwordEl.type = passwordEl.type === 'password' ? 'text' : 'password';
        };
    }

    const searchBox = document.getElementById('searchBox');
    const searchInput = document.getElementById('searchInput');
    const btnClear = document.getElementById('btnClearSearch');

    initNavbarSearch({ 
        searchBox, 
        searchInput, 
        btnClear, 
        availableIds, 
        filterItemsByProfile, 
        TMDB_SERVICE, 
        CATALOG_UI, 
        DB_CATALOG 
    });

    initMoodChips({ CATALOG_UI });

    document.querySelectorAll('.carousel').forEach(updateCarouselArrows);
}

// Global Telemetry Status Reporter
window.updateGlobalPlaybackStatus = async (status) => {
    const oldTitle = window.VIVOTV_VIEWING_STATUS?.title;
    window.VIVOTV_VIEWING_STATUS = status;
    
    const profile = getActiveProfile(currentProfile);
    if (status?.title && status.title !== oldTitle && supabase && profile) {
        try {
            await supabase
                .from('vivotv_profiles')
                .update({ now_playing: status })
                .eq('id', profile.id);
        } catch(e) { 
            console.warn('Error en guardado instantáneo telemetry:', e); 
        }
    }
};

// Event Listeners
window.addEventListener('update-my-list', () => loadMyList({ supabase, currentProfile, availableIds, CATALOG_UI, TMDB_SERVICE, DB_CATALOG }));
window.addEventListener('update-recent', () => loadRecentlyWatched({ supabase, currentProfile, CATALOG_UI, TMDB_SERVICE }));
window.addEventListener('refresh-my-list', () => {
    if (document.getElementById('favoritesGrid')) {
        loadMyList({ supabase, currentProfile, availableIds, CATALOG_UI, TMDB_SERVICE, DB_CATALOG });
    }
});

window.addEventListener('open-movie-detail', (e) => { 
    PLAYER_LOGIC.openDetail(e.detail.tmdbId, e.detail.type, supabase, availableIds); 
});

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

// Binge-Watch prompt listener
window.addEventListener('vivotv:binge_prompt', (e) => {
    const { season, episode } = e.detail;
    const promptEl = document.getElementById('bingePrompt');
    if (!promptEl) return;
    
    promptEl.classList.remove('hidden');
    
    let countdown = 5;
    const countdownEl = document.getElementById('bingeCountdown');
    const titleEl = document.getElementById('bingeNextTitle');
    if (countdownEl) countdownEl.textContent = countdown;
    if (titleEl) titleEl.textContent = `Temporada ${season} - Episodio ${episode + 1}`;
    
    const interval = setInterval(() => {
        countdown--;
        if (countdownEl) countdownEl.textContent = countdown;
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
        PLAYER_LOGIC.playNextEpisodeFrom(season, episode, supabase);
    };

    if (btnPlay) btnPlay.onclick = executeNextEpisode;
    if (btnCancel) btnCancel.onclick = () => {
        clearInterval(interval);
        promptEl.classList.add('hidden');
    };
});

// Batch loading and real-time content sync
window.addEventListener('batchLoaded', (e) => {
    const { ids } = e.detail;
    if (!ids || !ids.length) return;

    const cards = document.querySelectorAll('.movie-card');
    cards.forEach(card => {
        const cardTmdbId = card.dataset.tmdbId;
        if (ids.includes(cardTmdbId)) {
            const badge = card.querySelector('.coming-soon-badge');
            if (badge) {
                badge.classList.add('availability-pop');
                setTimeout(() => {
                    badge.className = 'available-badge';
                    badge.innerHTML = '<svg viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> DISPONIBLE';
                }, 300);
            }
        }
    });
});

window.addEventListener('contentAdded', async (e) => {
    const { tmdb_id } = e.detail;
    if (window.availableIds) window.availableIds.add(tmdb_id);
    window.dispatchEvent(new CustomEvent('batchLoaded', { detail: { ids: [tmdb_id] } }));
});

// Periodic lightweight catalog cache refresher (2 min interval, 25 min TTL check)
setInterval(async () => {
    try {
        const ts = sessionStorage.getItem('vivo_db_catalog_ts_v1');
        const REFRESH_THRESHOLD = 25 * 60 * 1000;
        if (ts && (Date.now() - parseInt(ts)) < REFRESH_THRESHOLD) return;
        await syncCatalog(supabase); 
    } catch (e) {
        console.warn('Error actualizando disponibles:', e);
    }
}, 120000);

// Visibility and SPA route synchronization
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const path = window.location.pathname;
        if (!path.includes('registro.html') && !path.includes('login.html')) {
            loadRecentlyWatched({ supabase, currentProfile, CATALOG_UI, TMDB_SERVICE });
            loadMyList({ supabase, currentProfile, availableIds, CATALOG_UI, TMDB_SERVICE, DB_CATALOG });
        }
    }
});

window.addEventListener('vivotv:page-changed', async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        ['searchBox', 'mainNav', 'userProfile'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('hidden');
        });
        const mobileNav = document.querySelector('.mobile-nav');
        if (mobileNav) mobileNav.classList.remove('hidden');

        initNavbarScroll();
        await populatePageContent();
        updateProfileUI();
        initMobileNavIndicator();
    } catch (err) {
        console.warn('[SPA Sync] Error sincronizando página:', err);
    }
});

window.addEventListener('beforeunload', () => stopHeartbeat());
window.addEventListener('pagehide', () => stopHeartbeat());

// Bootstrap orchestrator
(async function bootstrap() {
    console.log('%c VIVOTV %c 🚀 Modo Modular v3.0 ', 'background: #bb86fc; color: #000; font-weight: bold; padding: 2px 5px; border-radius: 3px 0 0 3px;', 'background: #1e293b; color: #fff; padding: 2px 5px; border-radius: 0 3px 3px 0;');
    
    try {
        initNavbarScroll();
        initMobileNavIndicator();
        initMagicSlide();
        initCarouselInertia();
        initBrandHubs();
        initAppForPage();

        await AuthService.initialize((event, session, profile) => {
            if (event === 'PASSWORD_RECOVERY') {
                showResetPasswordForm();
                return;
            }
            if (session) {
                if (profile) {
                    const currentLoadedProfile = window.VIVOTV_CURRENT_LOADED_PROFILE;
                    if (!window.VIVOTV_DASHBOARD_LOADED || (currentLoadedProfile && currentLoadedProfile !== profile.id)) {
                        window.VIVOTV_DASHBOARD_LOADED = true;
                        window.VIVOTV_CURRENT_LOADED_PROFILE = profile.id;
                        toDashboard(session.user, profile);
                    }
                } else {
                    window.VIVOTV_DASHBOARD_LOADED = false;
                    if (!window.location.pathname.includes('profiles.html')) {
                        window.location.href = 'profiles.html';
                    }
                }
            } else {
                window.VIVOTV_DASHBOARD_LOADED = false;
                if (window.location.pathname.includes('profiles.html')) return;
                toAuth(TMDB_SERVICE, CATALOG_UI);
            }
        });

        hideSplashScreen();
    } catch (err) {
        console.error('[Bootstrap Error] Fallo crítico en el arranque:', err);
        hideSplashScreen();
    }
})();
