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
const usernameEl    = document.getElementById('username');
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

let isLoginMode = !window.location.pathname.includes('registro.html');
let heroItems   = [];
let availableMovies = new Set();
let availableSeries = new Set();
let availableIds    = new Set();
let searchTimeout   = null;

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

// Inicializar efectos al cargar
document.addEventListener('DOMContentLoaded', () => {
    initNavbarScroll();
    initMagneticHover();
    initAuth();
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
// BUSQUEDA REAL-TIME & DEBOUNCING
// ================================================
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        if (searchBox && btnClear) {
            btnClear.classList.toggle('hidden', q.length === 0);
        }
        
        if (searchTimeout) clearTimeout(searchTimeout);
        if (q.length < 3) return;

        searchTimeout = setTimeout(async () => {
            const res = await TMDB_SERVICE.fetchFromTMDB('/search/multi', { query: q });
            if (res && res.results) {
                const filtered = res.results.filter(item => availableIds.has(item.id.toString()));
                const isMoviesPage = document.body.classList.contains('page-movies');
                const isSeriesPage = document.body.classList.contains('page-series');
                const isSearchPage = window.location.pathname.includes('busqueda.html');
                
                if (isSearchPage) {
                    renderSearchResults(filtered, q);
                } else {
                    const targetId = isMoviesPage ? 'popularCarousel' : (isSeriesPage ? 'popularCarousel' : 'trendingCarousel');
                    CATALOG_UI.renderCarousel(targetId, filtered, null, availableIds, `🔍 Resultados para "${q}"`);
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
// ================================================
// SUPABASE AUTH
// ================================================
async function initAuth() {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    
    // Si estamos en una página que requiere login y no hay sesión, redirigir
    const protectedPages = ['milista.html'];
    const isProtected = protectedPages.some(p => window.location.pathname.includes(p));

    if (session) {
        // Si hay sesión y estamos en login/registro, ir al home
        const loginPages = ['login_screen.html', 'registro.html'];
        const isLogin = loginPages.some(p => window.location.pathname.includes(p));
        if (isLogin) {
            window.location.href = 'index.html';
            return;
        }
        await toDashboard(session.user);
    } else {
        if (isProtected) {
            window.location.href = 'index.html'; // El index tiene el form de login
            return;
        }
        toAuth();
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN')  await toDashboard(session.user);
        if (event === 'SIGNED_OUT') toAuth();
    });
}

// NUEVO: Obtener IDs disponibles en Supabase
async function fetchAvailableIds() {
    if (!supabase) return;

    try {
        const fetchAllIds = async (tableName) => {
            let all = [], start = 0;
            while (true) {
                const { data, error } = await supabase.from(tableName)
                    .select('tmdb_id, created_at')
                    .order('created_at', { ascending: false })
                    .range(start, start + 999);
                if (error) { console.error(`[VivoTV] Error ${tableName}:`, error); break; }
                if (data) all.push(...data);
                if (!data || data.length < 1000) break;
                start += 1000;
            }
            return { data: all };
        };

        const [movies, series] = await Promise.all([
            fetchAllIds('video_sources'),
            fetchAllIds('series_episodes')
        ]);
        
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

        console.log('[VivoTV] Catálogo en tiempo real sincronizado con Supabase.');
    } catch (e) { 
        console.error('Error fetching available IDs:', e);
        showToast('Error cargando biblioteca. Revisa tu conexión.');
    }
}

async function toDashboard(user) {
    if (authSection) authSection.classList.add('hidden');
    if (dashSection) dashSection.classList.remove('hidden');
    if (userProfile) userProfile.classList.remove('hidden');
    const nameToShow = user.user_metadata?.username || user.email.split('@')[0];
    
    if (userNameEl) {
        userNameEl.textContent = nameToShow;
    }
    if (userAvatar) {
        userAvatar.textContent = nameToShow.charAt(0).toUpperCase();
        if (user.user_metadata?.avatar_url) {
            userAvatar.style.backgroundImage = `url('${user.user_metadata.avatar_url}')`;
            userAvatar.style.backgroundSize = 'cover';
            userAvatar.style.backgroundPosition = 'center';
            userAvatar.style.color = 'transparent';
        }
    }

    if (userProfile) {
        userProfile.style.cursor = 'pointer';
        userProfile.onclick = async () => {
            const newUrl = prompt("Cambiar logo de perfil (URL de imagen):", user.user_metadata?.avatar_url || "");
            if (newUrl !== null) {
                const { error } = await supabase.auth.updateUser({ data: { avatar_url: newUrl } });
                if (error) showToast("Error al actualizar perfil", "error");
                else { showToast("¡Logo actualizado!"); location.reload(); }
            }
        };
    }

    if (mainNav)     mainNav.classList.remove('hidden');
    if (mobileNav)   mobileNav.classList.remove('hidden');
    if (searchBox)   searchBox.classList.remove('hidden');
    
    if (window.location.hash !== '#linkMyList') window.scrollTo(0, 0);

    // 1. Cargar disponibilidad
    await fetchAvailableIds();

    // 2. Inicializar Páginas Específicas
    if (document.getElementById('favoritesGrid')) {
        loadMyList();
    }
    if (document.getElementById('searchResultsGrid')) {
        initSearchPage();
    }

    // 3. Detectar tipo de página para rows
    const isMoviesPage = document.body.classList.contains('page-movies');
    const isSeriesPage = document.body.classList.contains('page-series');
    const isAnimePage  = document.body.classList.contains('page-anime');
    const pageType     = (isSeriesPage || isAnimePage) ? 'tv' : (isMoviesPage ? 'movie' : 'all');

    try {
        // 3. Mostrar skeletons
        const carouselIds = [
            'trendingCarousel', 'popularMoviesCarousel', 'topRatedCarousel', 'popularTVCarousel',
            'actionCarousel', 'comedyCarousel', 'dramaCarousel', 'horrorCarousel',
            'popularCarousel', 'genre1Carousel', 'genre2Carousel', 'genre3Carousel', 'genre4Carousel'
        ];
        carouselIds.forEach(id => {
            if (document.getElementById(id)) CATALOG_UI.showSkeletons(id);
        });

        // 4. Cargar Hero
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
            
            const section = el.closest('.catalog-row');
            if (section) {
                if (filtered.length === 0) section.classList.add('hidden');
                else {
                    section.classList.remove('hidden');
                    const btnVerMas = section.querySelector('.btn-ver-mas');
                    if (btnVerMas) {
                        btnVerMas.onclick = () => { document.getElementById('gridContainer')?.scrollIntoView({ behavior: 'smooth' }); };
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
        } else if (isAnimePage) {
            // Lógica específica de ANIME
            await Promise.all([
                renderRow('popularCarousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/tv', { with_genres: 16, sort_by: 'popularity.desc' }), 'tv'),
                renderRow('topRatedCarousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/tv', { with_genres: 16, sort_by: 'vote_average.desc', 'vote_count.gte': 100 }), 'tv'),
                renderRow('genre1Carousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/tv', { with_genres: '16,10759' }), 'tv'),
                renderRow('genre2Carousel', () => TMDB_SERVICE.fetchFromTMDB('/discover/tv', { with_genres: '16,10765' }), 'tv'),
            ]);
        } else {
            // Películas o Series
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
        console.error('Error cargando catálogo:', e); 
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
            console.log(`[VivoTV] Cargando rejilla filtrada (${type}). IDs totales:`, 
                type === 'tv' ? availableSeries.size : availableMovies.size);
            
            const targetSet = type === 'tv' ? availableSeries : availableMovies;
            const allIds = Array.from(targetSet);
            
            const perPage = 28;
            const start = (page - 1) * perPage;
            const end   = start + perPage;
            const pageIds = allIds.slice(start, end);

            if (btnLoadMore) btnLoadMore.classList.toggle('hidden', end >= allIds.length);

            if (pageIds.length) {
                const detailsArray = [];
                const chunkSize = 10;
                for (let i = 0; i < pageIds.length; i += chunkSize) {
                    const chunk = pageIds.slice(i, i + chunkSize);
                    const chunkRes = await Promise.all(
                        chunk.map(id => TMDB_SERVICE.getDetails(id, type).catch(() => null))
                    );
                    detailsArray.push(...chunkRes);
                }

                if (loader) loader.classList.add('hidden');

                // Si es Anime, filtramos localmente los que NO tengan género 16 (Animación)
                let finalItems = detailsArray.filter(item => item && item.poster_path);
                if (isAnimePage) {
                    finalItems = finalItems.filter(item => item.genres?.some(g => g.id === 16));
                }

                // Mantenemos el orden de la base de datos (últimos subidos primero)
                // ya no ordenamos por fecha de estreno de TMDB para evitar que los nuevos se pierdan al final.

                finalItems.forEach(item => {
                    const card = CATALOG_UI.createMovieCard(item, type, true);
                    container.appendChild(card);
                });
            } else {
                if (loader) loader.classList.add('hidden');
                if (!append) {
                    container.innerHTML = `<p class="text-secondary" style="grid-column: 1/-1; text-align: center; padding: 40px;">No hay ${isAnimePage ? 'animes' : (type === 'tv' ? 'series' : 'películas')} disponibles en este momento.</p>`;
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
    sessionStorage.clear(); // Destruir catálogos cacheados al salir
    
    const isAuthPage = window.location.pathname.endsWith('index.html') || 
                       window.location.pathname.endsWith('registro.html') ||
                       window.location.pathname === '/' || 
                       window.location.pathname.endsWith('vivoweb/');
    
    if (!isAuthPage) { window.location.href = 'index.html'; return; }

    if (authSection) authSection.classList.remove('hidden');
    if (dashSection) dashSection.classList.add('hidden');
    if (userProfile) userProfile.classList.add('hidden');
    if (mainNav)     mainNav.classList.add('hidden');
    if (mobileNav)   mobileNav.classList.add('hidden');
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

if (toggleLink) {
    // Ya no prevenimos el default porque queremos que navegue a registro.html / index.html
    // Pero actualizamos los textos iniciales según el modo
    if (btnText) btnText.textContent = isLoginMode ? 'Iniciar Sesión' : 'Registrarme';
    if (authTitle) authTitle.textContent = isLoginMode ? 'Bienvenido de vuelta' : 'Crea tu cuenta';
    if (authSubtitle) authSubtitle.textContent = isLoginMode ? 'Inicia sesión para disfrutar...' : 'Crea tu cuenta gratis...';
}

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
            const username = usernameEl ? usernameEl.value.trim() : 'Usuario';
            const { data, error } = await supabase.auth.signUp({ 
                email, 
                password,
                options: { 
                    data: { 
                        username: username,
                        name: username // Para cumplir con el NOT NULL si persiste
                    } 
                }
            });
            if (error) throw error;
            
            // ÉXITO: Notificación y redirección suave
            showToast('📩 ¡Correo de confirmación enviado! Revisa tu bandeja de entrada.', 'success');
            setTimeout(() => {
                window.location.href = 'index.html'; // O tu URL de login
            }, 3000);
        }
    } catch (err) {
        if (authError) {
            authError.textContent = mapError(err.message);
            authError.classList.remove('hidden');
        }
    } finally { setLoading(false); }
});

if (btnLogout) btnLogout.addEventListener('click', async () => { 
    stopHeroRotation(); 
    sessionStorage.clear();
    await supabase.auth.signOut(); 
    window.location.reload();
});
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
    const m = msg.toLowerCase();
    if (m.includes('invalid login')) return '❌ Email o contraseña incorrectos.';
    if (m.includes('user already registered')) return '❌ Este correo electrónico ya está registrado.';
    if (m.includes('database error saving new user')) return '⚠️ El nombre de usuario ya existe o hay un error de perfil.';
    return msg;
}

// NUEVO: Debounce para búsqueda

async function initSearchPage() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (!q) return;

    const titleEl = document.getElementById('searchTitle');
    const searchInput = document.getElementById('searchInput');
    if (titleEl) titleEl.textContent = `Resultados para "${q}"`;
    if (searchInput) searchInput.value = q;

    const grid = document.getElementById('searchResultsGrid');
    if (grid) CATALOG_UI.showSkeletons('searchResultsGrid', 12);

    const res = await TMDB_SERVICE.fetchFromTMDB('/search/multi', { query: q });
    if (res && res.results) {
        const filtered = res.results.filter(item => availableIds.has(item.id.toString()));
        renderSearchResults(filtered, q);
    }
}

function renderSearchResults(results, query) {
    const grid = document.getElementById('searchResultsGrid');
    const empty = document.getElementById('noResultsState');
    if (!grid) return;

    grid.innerHTML = '';
    if (!results || results.length === 0) {
        empty?.classList.remove('hidden');
        return;
    }

    empty?.classList.add('hidden');
    results.forEach(item => {
        const type = item.media_type || (item.title ? 'movie' : 'tv');
        const card = CATALOG_UI.createMovieCard(item, type, true);
        grid.appendChild(card);
    });
}

async function loadMyList() {
    const section = document.getElementById('myListSection');
    const carousel = document.getElementById('myListCarousel');
    const favoritesGrid = document.getElementById('favoritesGrid');
    const emptyState = document.getElementById('emptyListState');
    
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch favorites with type
    const { data: favs } = await supabase.from('user_favorites')
        .select('tmdb_id, type')
        .eq('user_id', user.id)
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
            CATALOG_UI.renderCarousel('myListCarousel', details.filter(d => d), null, availableIds);
        } else {
            section.classList.add('hidden');
        }
    }
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
    const unique = history.filter(h => {
        const id = String(h.tmdb_id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
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

const btnHeroInfo = document.getElementById('btnHeroInfo');
if (btnHeroInfo) btnHeroInfo.addEventListener('click', (e) => {
    const b = e.currentTarget;
    PLAYER_LOGIC.openDetail(b.dataset.tmdbId, b.dataset.type, supabase);
});
// El manejo de btnModalPlay y btnCloseModal ahora se gestiona directamente en PLAYER_LOGIC.openDetail
// para una mayor reactividad y menor acoplamiento.

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

// document.addEventListener('DOMContentLoaded', () => initAuth()); // Movido a arriba con initNavbarScroll
