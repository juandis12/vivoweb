import { CONFIG } from './config.js';
import { TMDB_SERVICE } from './tmdb.js';
import { CATALOG_UI } from './ui.js';
import { showToast } from './utils.js';

// ---- ESTADO GLOBAL DEL CATÁLOGO ----
export let availableMovies = new Set();
export let availableSeries = new Set();
export let availableIds    = new Set();
export let DB_CATALOG      = [];

/**
 * Validador de tipos de contenido por página
 */
export function validateContentType(item, expectedType) {
    if (!item) return false;
    
    const genres = item.genres || item.genre_ids || [];
    const isAnim = genres.some(g => (typeof g === 'object' ? g.id : g) === 16);
    const isJapan = (item.origin_country && item.origin_country.includes('JP')) || 
                    item.original_language === 'ja' || 
                    (item.name && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(item.name));

    const isAnime = isAnim && isJapan;

    const isMoviesPage = document.body.classList.contains('page-movies');
    const isSeriesPage = document.body.classList.contains('page-series');
    const isAnimePage  = document.body.classList.contains('page-anime');

    if (isAnimePage) return isAnime;
    if (isSeriesPage) return !isAnime && expectedType === 'tv';
    if (isMoviesPage) return expectedType === 'movie';
    
    return true;
}

/**
 * Filtrado por Perfil (Seguridad Parental)
 */
export function filterItemsByProfile(items, currentProfile) {
    if (!items || !Array.isArray(items)) return [];
    if (!currentProfile?.is_kids) return items;

    const MANDATORY_GENRES = [10751, 10762]; 
    const SAFE_GENRES      = [16, 12, 35, 10759, 10765];
    const BANNED_GENRES    = [18, 27, 80, 53, 10749, 10767, 10763]; 

    return items.filter(item => {
        const genres = item.genres || item.genre_ids || [];
        const genreIds = genres.map(g => typeof g === 'object' ? g.id : g);
        if (genreIds.length === 0) return false;
        if (genreIds.some(id => BANNED_GENRES.includes(id))) return false;
        const isFamily = genreIds.some(id => MANDATORY_GENRES.includes(id));
        const isSafe = genreIds.some(id => SAFE_GENRES.includes(id));
        return isFamily || isSafe;
    });
}

/**
 * Sincronización Progresiva por Lotes
 * Evita saturación y permite actualizaciones en tiempo real
 */
export async function fetchAvailableIds(supabase) {
    if (!supabase) return;

    try {
        console.log('[VivoTV] 🔄 Iniciando Sincronización Progresiva...');

        const BATCH_SIZE = 200;
        let hasMore = true;
        let offset = 0;

        // Limpieza parcial solo si es la primera carga del ciclo
        if (offset === 0) {
            window.DB_CATALOG = [];
            // Nota: availableIds no se limpia para permitir persistencia entre lotes
        }

        // --- MODO RÁPIDO: VIDEO_SOURCES (DISPONIBILIDAD REAL) ---
        // Solo lo que esté aquí activará el badge de "DISPONIBLE"
        const { data: quickSources } = await supabase.from('video_sources').select('tmdb_id, type');
        if (quickSources) {
            console.log(`[VivoTV] 🎥 ${quickSources.length} fuentes de video detectadas (Disponibilidad Real).`);
            quickSources.forEach(item => {
                const id = item.tmdb_id?.toString().trim();
                if (id) {
                    availableIds.add(id);
                    if (item.type === 'movie' || item.type === 'pelicula') availableMovies.add(id);
                    else availableSeries.add(id);
                }
            });
            window.availableIds = availableIds;
            window.availableMovies = availableMovies;
            window.availableSeries = availableSeries;
            // Notificar cambios de disponibilidad
            dispatchBatchEvent(quickSources);
        }

        // --- MODO LOTE: CONTENT (MEMORIA DE METADATOS) ---
        // Estos items se guardan para búsqueda y visualización, pero NO activan disponibilidad automática
        while (hasMore) {
            console.log(`[VivoTV] 📡 Cargando lote de metadatos: ${offset} - ${offset + BATCH_SIZE}`);
            
            const { data: batch, error } = await supabase
                .from('content')
                .select('tmdb_id, content_type')
                .range(offset, offset + BATCH_SIZE - 1);

            if (error) {
                console.warn('[VivoTV] ⚠️ Error en lote de metadatos:', error.message);
                hasMore = false;
                break;
            }

            if (!batch || batch.length === 0) {
                hasMore = false;
                break;
            }

            console.log(`[VivoTV] 📥 Recibidos ${batch.length} items de metadatos.`);

            // Procesar lote de metadatos (Cache local)
            if (!window.DB_CATALOG) window.DB_CATALOG = [];
            
            batch.forEach(item => {
                const id = item.tmdb_id?.toString().trim();
                if (!id) return;
                
                // Guardamos en el catálogo maestro
                const exists = window.DB_CATALOG.some(db => db.tmdb_id === id);
                if (!exists) window.DB_CATALOG.push(item);
            });

            if (batch.length < BATCH_SIZE) hasMore = false;
            offset += BATCH_SIZE;

            await new Promise(r => setTimeout(r, 50));
        }

        console.log(`[VivoTV] ✅ Sincronización Progresiva Completa. Disponibles: ${availableIds.size}. Conocidos: ${window.DB_CATALOG?.length || 0}.`);
    } catch (e) {
        console.error('[VivoTV] ❌ Fallo en sincronización:', e);
    }
}

function dispatchBatchEvent(items) {
    const ids = items.map(i => i.tmdb_id?.toString().trim()).filter(id => id);
    window.dispatchEvent(new CustomEvent('batchLoaded', { detail: { ids } }));
}

/**
 * Carga de datos de grilla
 */
export async function loadGridData(type, page, append = false, currentProfile) {
    const container = document.getElementById('gridContainer');
    const loader    = document.getElementById('gridLoader');
    const btnLoadMore = document.getElementById('btnLoadMore');
    if (!container) return;

    if (!append) container.innerHTML = '';
    if (loader) loader.classList.remove('hidden');

    try {
        const isMoviesPage = document.body.classList.contains('page-movies');
        const isSeriesPage = document.body.classList.contains('page-series');
        const isAnimePage  = document.body.classList.contains('page-anime');

        if (isMoviesPage || isSeriesPage || isAnimePage) {
            const targetSet = isMoviesPage ? availableMovies : availableSeries;
            const allIds = Array.from(targetSet);
            
            const perPage = 10;
            const start = (page - 1) * perPage;
            const end   = start + perPage;
            let pageIds = allIds.slice(start, end);
            
            if (btnLoadMore) btnLoadMore.classList.toggle('hidden', end >= allIds.length);

            // Si hay IDs en la DB, los usamos. Si no (y estamos en una página vacía), avisamos.
            if (pageIds.length) {
                const finalItems = [];
                for (const id of pageIds) {
                    const localItem = DB_CATALOG.find(i => i.tmdb_id?.toString() === id);
                    if (localItem) finalItems.push(localItem);
                    else {
                        const details = await TMDB_SERVICE.getDetails(id, isMoviesPage ? 'movie' : 'tv').catch(() => null);
                        if (details) finalItems.push(details);
                    }
                }

                if (loader) loader.classList.add('hidden');
                let filteredItems = filterItemsByProfile(finalItems, currentProfile);
                filteredItems = filteredItems.filter(item => validateContentType(item, isMoviesPage ? 'movie' : 'tv'));

                const fragment = document.createDocumentFragment();
                filteredItems.forEach(item => {
                    const card = CATALOG_UI.createMovieCard(item, type, true);
                    fragment.appendChild(card);
                });
                container.appendChild(fragment);
            } else {
                if (loader) loader.classList.add('hidden');
            }
            return;
        }

        // --- MODO DESCUBRIMIENTO (Dashboard / Trending) ---
        const data = type === 'tv' ? await TMDB_SERVICE.getPopularTV(page) : await TMDB_SERVICE.getPopularMovies(page);
        if (loader) loader.classList.add('hidden');
        if (data.results?.length) {
            // Filtramos por perfil, pero NO por availableIds en el Dashboard principal
            const results = filterItemsByProfile(data.results, currentProfile);
            const fragment = document.createDocumentFragment();
            results.forEach(item => {
                const isAvail = availableIds.has(item.id.toString());
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

export async function renderDBCatalog(containerId, filterType = 'all', isAnime = false) {
    if (!DB_CATALOG || DB_CATALOG.length === 0) return;
    let items = DB_CATALOG;
    if (filterType !== 'all') items = items.filter(item => item.content_type === filterType);
    if (isAnime) {
        const animeItems = [];
        const pool = items.slice(0, 40);
        await Promise.all(pool.map(async (item) => {
            const details = await TMDB_SERVICE.getDetails(item.tmdb_id, item.content_type === 'series' ? 'tv' : 'movie').catch(() => null);
            if (details && (details.genres || []).some(g => g.id === 16)) animeItems.push(item);
        }));
        items = animeItems;
    }
    if (items.length > 0) CATALOG_UI.renderCarousel(containerId, items, null, availableIds);
}

export async function executeSearch(query, currentProfile, availableIds) {
    try {
        const res = await TMDB_SERVICE.fetchFromTMDB('/search/multi', { query });
        if (res && res.results) {
            let results = res.results.filter(item => item.media_type !== 'person');
            return filterItemsByProfile(results, currentProfile);
        }
        return [];
    } catch (e) {
        console.error('Search error:', e);
        return [];
    }
}

export async function loadMyList(supabase, currentProfile, availableIds) {
    if (!supabase || !currentProfile) return [];
    const { data: favs } = await supabase.from('user_favorites').select('tmdb_id, type').eq('profile_id', currentProfile.id);
    if (!favs?.length) return [];
    const details = await Promise.all(favs.map(f => TMDB_SERVICE.getDetails(f.tmdb_id, f.type || 'movie').catch(() => null)));
    return details.filter(d => d);
}

export async function loadRecommendedItems(supabase, currentProfile, availableIds) {
    if (!supabase || !currentProfile) return [];
    try {
        const { data: history } = await supabase.from('watch_history').select('tmdb_id, type').eq('profile_id', currentProfile.id).order('last_watched', { ascending: false }).limit(5);
        if (!history || history.length === 0) return [];
        const allRes = await Promise.all(history.map(h => TMDB_SERVICE.getRecommendations(h.tmdb_id, h.type).catch(() => ({ results: [] }))));
        let combined = [];
        allRes.forEach(res => { if (res && res.results) combined.push(...res.results); });
        const seen = new Set();
        let filtered = combined.filter(item => {
            const id = item.id.toString();
            if (seen.has(id) || !availableIds.has(id)) return false;
            seen.add(id);
            return true;
        });
        return filterItemsByProfile(filtered, currentProfile).slice(0, 20);
    } catch (e) {
        console.error('Error en loadRecommendedItems:', e);
        return [];
    }
}
