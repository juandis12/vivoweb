import { CONFIG } from './config.js';
import { TMDB_SERVICE, CATALOG_UI } from './tmdb.js';
import { PLAYER_LOGIC, setSupabase } from './player.js';
import { showToast } from './utils.js';

// ---- SUPABASE ----
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
let supabase;
try {
    supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    setSupabase(supabase);
} catch(e) { console.warn('Supabase no disponible:', e); }

// ---- REFERENCIAS DOM ----
const authSection   = document.getElementById('authSection');
const dashSection   = document.getElementById('dashboardSection');
const loginForm     = document.getElementById('loginForm');
const emailEl       = document.getElementById('email');
const passwordEl    = document.getElementById('password');
const btnSubmit     = document.getElementById('btnSubmit');
const btnText       = document.getElementById('btnText');
const btnLoader     = document.getElementById('btnLoader');
const authError     = document.getElementById('authError');
const toggleLink    = document.getElementById('toggleAuthMode');
const userProfile   = document.getElementById('userProfile');
const mainNav       = document.getElementById('mainNav');
const mobileNav     = document.querySelector('.mobile-nav');
const btnLogout     = document.getElementById('btnLogout');
const userNameEl    = document.getElementById('userName');
const userAvatar    = document.getElementById('userAvatar');
const searchBox     = document.getElementById('searchBox');
const searchInput   = document.getElementById('searchInput');
const btnClear      = document.getElementById('btnClearSearch');
const btnFav        = document.getElementById('btnAddToMyList');
const btnPass       = document.getElementById('btnTogglePass');
const authTitle     = document.getElementById('authTitle');
const authSubtitle  = document.getElementById('authSubtitle');

let isLoginMode = true;
let heroItems   = [];
let availableMovies = new Set();
let availableSeries = new Set();
let availableIds    = new Set(); // Mantener para compatibilidad en carruseles mixtos

// ================================================
// NAVBAR SCROLL
// ================================================
window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 50);
});

// NUEVO: Toggle de búsqueda para móviles/táctil
if (searchBox) {
    searchBox.addEventListener('click', (e) => {
        searchBox.classList.add('active');
        if (searchInput) searchInput.focus();
        e.stopPropagation();
    });
    document.addEventListener('click', (e) => {
        if (searchBox && !searchBox.contains(e.target)) {
            searchBox.classList.remove('active');
        }
    });
}

// ================================================
// SUPABASE AUTH
// ================================================
async function initAuth() {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    console.log('[VivoTV] Session:', session ? `Logged in as ${session.user.email}` : 'Not logged in');
    if (session) await toDashboard(session.user);
    else toAuth();

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN')  await toDashboard(session.user);
        if (event === 'SIGNED_OUT') toAuth();
    });
}

// NUEVO: Obtener IDs disponibles en Supabase
async function fetchAvailableIds() {
    if (!supabase) return;
    try {
        const [movies, series] = await Promise.all([
            supabase.from('video_sources').select('tmdb_id'),
            supabase.from('series_episodes').select('tmdb_id')
        ]);
        
        if (movies.error) console.error('[VivoTV] Supabase Movies Error:', movies.error);
        if (series.error) console.error('[VivoTV] Supabase Series Error:', series.error);

        console.log('[VivoTV] Raw Movies Data:', movies.data?.length || 0, 'items');
        console.log('[VivoTV] Raw Series Data:', series.data?.length || 0, 'items');
        
        availableMovies = new Set();
        availableSeries = new Set();
        availableIds = new Set();

        if (movies.data) {
            movies.data.forEach(m => {
                const id = m.tmdb_id.toString();
                availableMovies.add(id);
                availableIds.add(id);
            });
        }
        if (series.data) {
            series.data.forEach(s => {
                const id = s.tmdb_id.toString();
                availableSeries.add(id);
                availableIds.add(id);
            });
        }
    } catch (e) { 
        console.error('Error fetching available IDs:', e);
        showToast('Error cargando biblioteca. Revisa tu conexión.');
    }
}

async function toDashboard(user) {
    if (authSection) authSection.classList.add('hidden');
    if (dashSection) dashSection.classList.remove('hidden');
    if (userProfile) userProfile.classList.remove('hidden');
    if (mainNav)     mainNav.classList.remove('hidden');
    if (mobileNav)   mobileNav.style.display = 'flex';
    if (searchBox)   searchBox.classList.remove('hidden');
    
    if (window.location.hash !== '#linkMyList') window.scrollTo(0, 0);

    if (userNameEl && userAvatar) {
        const name = user.email.split('@')[0];
        userNameEl.textContent = name;
        userAvatar.textContent = name[0].toUpperCase();
    }

    // 1. Cargar disponibilidad
    await fetchAvailableIds();

    // 2. Detectar tipo de página
    const isMoviesPage = document.body.classList.contains('page-movies');
    const isSeriesPage = document.body.classList.contains('page-series');
    const pageType = isSeriesPage ? 'tv' : (isMoviesPage ? 'movie' : 'all');

    try {
        // 3. Mostrar skeletons
        const carouselIds = [
            'trendingCarousel', 'popularMoviesCarousel', 'topRatedCarousel', 'popularTVCarousel',
            'actionCarousel', 'comedyCarousel', 'dramaCarousel', 'horrorCarousel'
        ];
        carouselIds.forEach(id => {
            if (document.getElementById(id)) CATALOG_UI.showSkeletons(id);
        });

        // 4. Cargar Hero
        let heroData;
        if (pageType === 'tv') heroData = await TMDB_SERVICE.fetchFromTMDB('/trending/tv/day');
        else if (pageType === 'movie') heroData = await TMDB_SERVICE.fetchFromTMDB('/trending/movie/day');
        else heroData = await TMDB_SERVICE.getTrending();

        // Filtrar Hero solo disponibles
        heroItems = (heroData.results || []).filter(m => m.backdrop_path && availableIds.has(m.id.toString())).slice(0, 8);
        
        if (heroItems.length && document.getElementById('heroBanner')) {
            CATALOG_UI.renderHero(heroItems[0], heroItems);
            startHeroRotation();
        } else if (document.getElementById('heroBanner')) {
            // Fallback si no hay nada disponible en tendencia
            document.getElementById('heroBanner').classList.add('hidden');
        }

        // 5. Cargar Filas (Filtradas)
        const renderRow = async (containerId, fetchFn, type, title) => {
            const el = document.getElementById(containerId);
            if (!el) return;
            const data = await fetchFn();
            const filtered = (data.results || []).filter(item => availableIds.has(item.id.toString()));
            CATALOG_UI.renderCarousel(containerId, filtered, type, availableIds);
            
            // Gestionar visibilidad de la sección y "Ver más"
            const section = el.closest('.catalog-row');
            if (section) {
                if (filtered.length === 0) section.classList.add('hidden');
                else {
                    section.classList.remove('hidden');
                    const btnVerMas = section.querySelector('.btn-ver-mas');
                    if (btnVerMas) {
                        btnVerMas.onclick = () => {
                            const grid = document.getElementById('gridContainer');
                            if (grid) {
                                grid.scrollIntoView({ behavior: 'smooth' });
                                showToast(`Explora más en la sección inferior.`);
                            }
                        };
                    }
                }
            }
        };

        if (pageType === 'all') {
            await Promise.all([
                renderRow('trendingCarousel', () => TMDB_SERVICE.getTrending(), null),
                renderRow('popularMoviesCarousel', () => TMDB_SERVICE.getPopularMovies(), 'movie'),
                renderRow('topRatedCarousel', () => TMDB_SERVICE.getTopRated(), 'movie'),
                renderRow('popularTVCarousel', () => TMDB_SERVICE.getPopularTV(), 'tv')
            ]);
        } else {
            // Páginas específicas: Películas o Series
            const fetchPopular = () => pageType === 'tv' ? TMDB_SERVICE.getPopularTV() : TMDB_SERVICE.getPopularMovies();
            const fetchTop = () => pageType === 'tv' ? TMDB_SERVICE.fetchFromTMDB('/tv/top_rated') : TMDB_SERVICE.getTopRated();
            
            await Promise.all([
                renderRow('popularCarousel', fetchPopular, pageType),
                renderRow('topRatedCarousel', fetchTop, pageType),
                renderRow('genre1Carousel', () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { with_genres: pageType==='tv'?10759:28 }), pageType),
                renderRow('genre2Carousel', () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { with_genres: 35 }), pageType),
                renderRow('genre3Carousel', () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { with_genres: pageType==='tv'?18:10749 }), pageType),
                renderRow('genre4Carousel', () => TMDB_SERVICE.fetchFromTMDB(`/discover/${pageType}`, { with_genres: pageType==='tv'?10765:27 }), pageType),
            ]);

            // 6. Cargar Grilla de "Todas las..." al final
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
        }

    } catch (e) { 
        console.error('Error cargando catálogo:', e); 
        showToast('Error de conexión con el catálogo.');
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

        if (isMoviesPage || isSeriesPage) {
            console.log(`[VivoTV] Cargando rejilla filtrada (${type}). IDs totales:`, 
                type === 'tv' ? availableSeries.size : availableMovies.size);
            
            const targetSet = type === 'tv' ? availableSeries : availableMovies;
            const allIds = Array.from(targetSet);
            
            const perPage = 28; // Aumentar un poco para llenar pantallas grandes
            const start = (page - 1) * perPage;
            const end   = start + perPage;
            const pageIds = allIds.slice(start, end);

            if (btnLoadMore) btnLoadMore.classList.toggle('hidden', end >= allIds.length);

            if (pageIds.length) {
                // Fetch details in smaller chunks to avoid rate limiting
                const detailsArray = [];
                const chunkSize = 10;
                for (let i = 0; i < pageIds.length; i += chunkSize) {
                    const chunk = pageIds.slice(i, i + chunkSize);
                    console.log(`[VivoTV] Fetching chunk ${i/chunkSize + 1} for ${type}...`);
                    const chunkRes = await Promise.all(
                        chunk.map(id => TMDB_SERVICE.getDetails(id, type).catch(() => null))
                    );
                    detailsArray.push(...chunkRes);
                }

                if (loader) loader.classList.add('hidden');

                detailsArray.forEach(item => {
                    if (!item || !item.poster_path) return;
                    const card = CATALOG_UI.createMovieCard(item, type, true);
                    container.appendChild(card);
                });
            } else {
                if (loader) loader.classList.add('hidden');
                if (!append) {
                    container.innerHTML = `<p class="text-secondary" style="grid-column: 1/-1; text-align: center; padding: 40px;">No hay ${type === 'tv' ? 'series' : 'películas'} disponibles en este momento.</p>`;
                }
            }
            return;
        }

        // ---- MODO NORMAL: POPULARES TMDB ----
        const data = type === 'tv' 
            ? await TMDB_SERVICE.getPopularTV(page)
            : await TMDB_SERVICE.getPopularMovies(page);

        if (loader) loader.classList.add('hidden');
        
        if (data.results?.length) {
            data.results.forEach(item => {
                if (!item.poster_path) return;
                const isAvail = availableIds.has(item.id.toString()) || availableIds.has(item.id);
                const card = CATALOG_UI.createMovieCard(item, type, isAvail);
                container.appendChild(card);
            });
        }
    } catch (e) {
        console.error('Error cargando grid:', e);
        if (loader) loader.classList.add('hidden');
    }
}

function toAuth() {
    const isIndex = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('vivoweb/');
    if (!isIndex) { window.location.href = 'index.html'; return; }

    if (authSection) authSection.classList.remove('hidden');
    if (dashSection) dashSection.classList.add('hidden');
    if (userProfile) userProfile.classList.add('hidden');
    if (mainNav)     mainNav.classList.add('hidden');
    if (mobileNav)   mobileNav.style.display = 'none';
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

if (toggleLink) toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    toggleLink.textContent = isLoginMode ? 'Regístrate gratis' : 'Inicia Sesión';
    if (btnText) btnText.textContent = isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta';
    if (authTitle) authTitle.textContent = isLoginMode ? 'Bienvenido de vuelta' : 'Crea tu cuenta';
    if (authSubtitle) authSubtitle.textContent = isLoginMode ? 'Inicia sesión para disfrutar...' : 'Crea tu cuenta gratis...';
});

if (loginForm) loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(true);
    if (authError) authError.classList.add('hidden');
    try {
        const email = emailEl.value.trim();
        const password = passwordEl.value;
        if (isLoginMode) {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
        } else {
            const { error } = await supabase.auth.signUp({ email, password });
            if (error) throw error;
        }
    } catch (err) {
        if (authError) {
            authError.textContent = mapError(err.message);
            authError.classList.remove('hidden');
        }
    } finally { setLoading(false); }
});

if (btnLogout) btnLogout.addEventListener('click', () => { stopHeroRotation(); supabase.auth.signOut(); });
if (btnPass) btnPass.addEventListener('click', () => { passwordEl.type = passwordEl.type === 'password' ? 'text' : 'password'; });

if (btnClear) btnClear.addEventListener('click', () => {
    searchInput.value = '';
    btnClear.classList.add('hidden');
    const isSeriesPage = document.body.classList.contains('page-series');
    const type = isSeriesPage ? 'tv' : 'movie';
    loadGridData(type, 1);
});

function setLoading(v) {
    if (btnText) btnText.classList.toggle('hidden', v);
    if (btnLoader) btnLoader.classList.toggle('hidden', !v);
    if (btnSubmit) btnSubmit.disabled = v;
}

function mapError(msg) {
    if (msg.toLowerCase().includes('invalid login')) return '❌ Email o contraseña incorrectos.';
    return msg;
}

// NUEVO: Debounce para búsqueda
let searchDebounceTimer;
if (searchInput) searchInput.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    if (btnClear) btnClear.classList.toggle('hidden', q.length === 0);
    
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    
    if (q.length < 3) return;

    searchDebounceTimer = setTimeout(async () => {
        const res = await TMDB_SERVICE.search(q);
        if (res.results.length) {
            const isMoviesPage = document.body.classList.contains('page-movies');
            const isSeriesPage = document.body.classList.contains('page-series');
            const pageType = isSeriesPage ? 'tv' : (isMoviesPage ? 'movie' : 'all');

            // Filtrar por disponibilidad SIEMPRE
            const filtered = res.results.filter(item => {
                const id = item.id.toString();
                // Si estamos en página de Películas, solo mostrar películas disponibles
                if (pageType === 'movie' && item.media_type !== 'movie') return false;
                // Si estamos en página de Series, solo mostrar series disponibles
                if (pageType === 'tv' && item.media_type !== 'tv') return false;
                
                return availableIds.has(id);
            });

            // Encontrar el primer carrusel disponible para mostrar resultados
            const targetCarousel = isMoviesPage ? 'popularCarousel' : 
                                 (isSeriesPage ? 'popularCarousel' : 'trendingCarousel');
            
            const carousel = document.getElementById(targetCarousel);
            const grid     = document.getElementById('gridContainer');

            if (carousel) {
                // Actualizar título de la sección si es búsqueda
                const section = carousel.closest('.catalog-row');
                const rowTitle = section?.querySelector('.row-title');
                if (rowTitle) rowTitle.textContent = `🔍 Resultados para "${q}"`;
                
                CATALOG_UI.renderCarousel(targetCarousel, filtered, null, availableIds);
                if (section) section.classList.remove('hidden');
            } else if (grid) {
                // Compatibilidad con cuadrícula antigua (si quedase alguna)
                grid.innerHTML = '';
                if (filtered.length) {
                    filtered.forEach(item => {
                        const card = CATALOG_UI.createMovieCard(item, item.media_type || (isSeriesPage ? 'tv' : 'movie'), true);
                        grid.appendChild(card);
                    });
                } else {
                    grid.innerHTML = `<p class="text-secondary" style="grid-column: 1/-1; text-align: center; padding: 40px;">No se encontraron resultados disponibles para "${q}".</p>`;
                }
            }
        }
    }, 500);
});

async function loadMyList() {
    const section = document.getElementById('myListSection');
    const carousel = document.getElementById('myListCarousel');
    if (!section || !carousel || !supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: favs } = await supabase.from('user_favorites').select('tmdb_id').eq('user_id', user.id);
    if (favs?.length) {
        section.classList.remove('hidden');
        const details = await Promise.all(favs.map(f => TMDB_SERVICE.getDetails(f.tmdb_id)));
        CATALOG_UI.renderCarousel('myListCarousel', details, null, availableIds);
    } else { section.classList.add('hidden'); }
}

async function loadRecentlyWatched() {
    const section = document.getElementById('recentSection');
    const carousel = document.getElementById('recentCarousel');
    if (!section || !carousel || !supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: history } = await supabase.from('watch_history').select('*').eq('user_id', user.id).order('last_watched', { ascending: false }).limit(20);
    if (!history?.length) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    carousel.innerHTML = '';
    const seen = new Set();
    const unique = history.filter(h => { if (seen.has(h.tmdb_id)) return false; seen.add(h.tmdb_id); return true; });
    for (const item of unique) {
        const details = await TMDB_SERVICE.getDetails(item.tmdb_id, item.type).catch(() => null);
        if (!details || !details.poster_path) continue;
        const card = CATALOG_UI.createMovieCard(details, item.type, true); // En recientes asumimos disponible
        carousel.appendChild(card);
    }
}

window.addEventListener('update-my-list', loadMyList);
window.addEventListener('update-recent', loadRecentlyWatched);
if (btnFav) btnFav.addEventListener('click', () => PLAYER_LOGIC.toggleFavorite(supabase));
window.addEventListener('open-movie-detail', (e) => { PLAYER_LOGIC.openDetail(e.detail.tmdbId, e.detail.type, supabase); });
const btnCloseModal = document.getElementById('btnCloseModal');
if (btnCloseModal) btnCloseModal.addEventListener('click', () => PLAYER_LOGIC.closeModal());
const btnHeroPlay = document.getElementById('btnHeroPlay');
if (btnHeroPlay) btnHeroPlay.addEventListener('click', (e) => {
    const b = e.currentTarget;
    PLAYER_LOGIC.openDetail(b.dataset.tmdbId, b.dataset.type, supabase);
});
const btnModalPlay = document.getElementById('btnModalPlay');
if (btnModalPlay) btnModalPlay.addEventListener('click', () => {
    const v = document.getElementById('videoPlayer');
    if (v && !v.classList.contains('hidden')) v.play().catch(() => {});
});

document.addEventListener('DOMContentLoaded', () => initAuth());

// ---- CAROUSEL NAVIGATION ----
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.carousel-arrow');
    if (!btn) return;
    const wrapper = btn.closest('.carousel-wrapper');
    const carousel = wrapper ? wrapper.querySelector('.carousel') : null;
    if (!carousel) return;
    
    const direction = btn.classList.contains('carousel-arrow-left') ? -1 : 1;
    const scrollAmount = carousel.clientWidth * 0.8;
    carousel.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
});
