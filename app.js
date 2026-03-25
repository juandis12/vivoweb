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
let availableIds = new Set();

// ================================================
// NAVBAR SCROLL
// ================================================
window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 50);
});

// ================================================
// SUPABASE AUTH
// ================================================
async function initAuth() {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
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
        
        availableIds = new Set();
        if (movies.data) movies.data.forEach(m => availableIds.add(m.tmdb_id.toString()));
        if (series.data) series.data.forEach(s => availableIds.add(s.tmdb_id.toString()));
    } catch (e) { console.error('Error fetching available IDs:', e); }
}

async function toDashboard(user) {
    if (authSection) authSection.classList.add('hidden');
    if (dashSection) dashSection.classList.remove('hidden');
    if (userProfile) userProfile.classList.remove('hidden');
    if (mainNav)     mainNav.classList.remove('hidden');
    if (searchBox)   searchBox.classList.remove('hidden');
    
    if (window.location.hash !== '#linkMyList') window.scrollTo(0, 0);

    if (userNameEl && userAvatar) {
        const name = user.email.split('@')[0];
        userNameEl.textContent = name;
        userAvatar.textContent = name[0].toUpperCase();
    }

    // Cargar disponibilidad antes de renderizar
    await fetchAvailableIds();

    const gridContainer = document.getElementById('gridContainer');
    const isSeriesPage  = document.body.classList.contains('page-series');

    if (gridContainer) {
        const type = isSeriesPage ? 'tv' : 'movie';
        await loadGridData(type, 1);
        
        const btnLoadMore = document.getElementById('btnLoadMore');
        if (btnLoadMore) {
            let currentPage = 1;
            btnLoadMore.onclick = async () => {
                currentPage++;
                await loadGridData(type, currentPage, true);
            };
        }
    } else {
        try {
            const [trending, popular, topRated, popularTV] = await Promise.all([
                TMDB_SERVICE.getTrending(),
                TMDB_SERVICE.getPopularMovies(),
                TMDB_SERVICE.getTopRated(),
                TMDB_SERVICE.getPopularTV(),
            ]);

            heroItems = trending.results.filter(m => m.backdrop_path).slice(0, 8);
            
            if (heroItems.length && document.getElementById('heroBanner')) {
                CATALOG_UI.renderHero(heroItems[0], heroItems);
                startHeroRotation();
            }

            if (document.getElementById('trendingCarousel')) 
                CATALOG_UI.renderCarousel('trendingCarousel', trending.results, null, availableIds);
            if (document.getElementById('popularMoviesCarousel'))
                CATALOG_UI.renderCarousel('popularMoviesCarousel', popular.results, 'movie', availableIds);
            if (document.getElementById('topRatedCarousel'))
                CATALOG_UI.renderCarousel('topRatedCarousel', topRated.results, 'movie', availableIds);
            if (document.getElementById('popularTVCarousel'))
                CATALOG_UI.renderCarousel('popularTVCarousel', popularTV.results, 'tv', availableIds);

        } catch (e) { console.error('Error cargando catálogo:', e); }
    }

    await loadMyList();
    await loadRecentlyWatched();
}

async function loadGridData(type, page, append = false) {
    const container = document.getElementById('gridContainer');
    const loader    = document.getElementById('gridLoader');
    if (!container) return;

    if (!append) container.innerHTML = '';
    if (loader) loader.classList.remove('hidden');

    try {
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

function setLoading(v) {
    if (btnText) btnText.classList.toggle('hidden', v);
    if (btnLoader) btnLoader.classList.toggle('hidden', !v);
    if (btnSubmit) btnSubmit.disabled = v;
}

function mapError(msg) {
    if (msg.toLowerCase().includes('invalid login')) return '❌ Email o contraseña incorrectos.';
    return msg;
}

if (searchInput) searchInput.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    if (btnClear) btnClear.classList.toggle('hidden', q.length === 0);
    if (q.length < 3) return;
    setTimeout(async () => {
        const res = await TMDB_SERVICE.search(q);
        if (res.results.length) {
            const carousel = document.getElementById('popularMoviesCarousel');
            if (carousel) CATALOG_UI.renderCarousel('popularMoviesCarousel', res.results, null, availableIds);
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
