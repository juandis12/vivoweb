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
    
    // Unificar géneros
    const genres = item.genres || item.genre_ids || [];
    const genreIds = genres.map(g => typeof g === 'object' ? g.id : g);
    
    // Definición de Anime: Género Animación (16) + (Origen Japonés O Idioma Japonés O Nombre con caracteres Japoneses)
    const isAnim = genreIds.includes(16);
    const isJapan = (item.origin_country && (Array.isArray(item.origin_country) ? item.origin_country.includes('JP') : item.origin_country === 'JP')) || 
                    item.original_language === 'ja' || 
                    (item.name && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(item.name));

    // Si es Anime en la DB, confiamos en la etiqueta local. Si es de TMDB, combinamos Animación + Japón.
    const isManuallyMarkedAnime = (item.content_type || '').toLowerCase() === 'anime';

    const isAnime = isManuallyMarkedAnime || (isAnim && isJapan);

    const isMoviesPage = document.body.classList.contains('page-movies');
    const isSeriesPage = document.body.classList.contains('page-series');
    const isAnimePage  = document.body.classList.contains('page-anime');

    // FILTRADO ESTRICTO POR PÁGINA
    if (isAnimePage) return isAnime;
    if (isSeriesPage) return expectedType === 'tv' && !isAnime;
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

let isSyncing = false;

export async function validateBatchAvailability(supabase, ids) {
    if (!supabase || !ids || !ids.length) return;
    
    try {
        const strIds = ids.map(id => id.toString());
        
        // CONSULTA MULTI-TABLA PARALELA (Películas + Series/Anime)
        const [movieRes, seriesRes] = await Promise.all([
            supabase.from('video_sources').select('tmdb_id, type').in('tmdb_id', strIds),
            supabase.from('series_episodes').select('tmdb_id').in('tmdb_id', strIds)
        ]);

        const matches = [];

        // Procesar Películas
        if (movieRes.data && movieRes.data.length > 0) {
            movieRes.data.forEach(m => {
                const id = m.tmdb_id.toString();
                availableIds.add(id);
                if (m.type === 'movie' || m.type === 'pelicula') availableMovies.add(id);
                matches.push({ tmdb_id: id, type: m.type });
            });
        }

        // Procesar Series/Anime
        if (seriesRes.data && seriesRes.data.length > 0) {
            seriesRes.data.forEach(s => {
                const id = s.tmdb_id.toString();
                if (!availableIds.has(id)) {
                    availableIds.add(id);
                    availableSeries.add(id);
                    matches.push({ tmdb_id: id, type: 'tv' });
                }
            });
        }

        if (matches.length > 0) {
            console.log(`[VivoTV] 🔍 Multi-Tabla: Encontrados ${matches.length} matches (Cine/Series) de ${strIds.length} IDs.`);
            
            // Sincronizar referencias globales
            window.availableIds = availableIds;
            window.availableMovies = availableMovies;
            window.availableSeries = availableSeries;

            // Notificar a la UI
            dispatchBatchEvent(matches);
        }
    } catch (e) {
        console.warn('[VivoTV] Error en validación multi-tabla:', e);
    }
}

/**
 * SINCRONIZACIÓN DE METADATOS (Cache Local)
 * Solo carga lo que hay en tu tabla 'content' para las filas de "Disponibles"
 */
export async function fetchAvailableIds(supabase) {
    if (!supabase || isSyncing) return;
    isSyncing = true;

    try {
        console.log('[VivoTV] 📡 Sincronizando Catálogo Personal...');
        const BATCH_SIZE = 500;
        let hasMore = true;
        let offset = 0;

        while (hasMore) {
            const { data: batch, error } = await supabase
                .from('content')
                .select('*')
                .range(offset, offset + BATCH_SIZE - 1);

            if (error || !batch || batch.length === 0) {
                hasMore = false;
                break;
            }

            if (!window.DB_CATALOG) window.DB_CATALOG = [];
            
            batch.forEach(item => {
                const id = item.tmdb_id?.toString();
                if (!id) return;
                
                // Si está en 'content', por definición está disponible
                availableIds.add(id);
                if (item.content_type === 'series') availableSeries.add(id);
                else availableMovies.add(id);

                const exists = window.DB_CATALOG.some(db => db.tmdb_id === id);
                if (!exists) window.DB_CATALOG.push(item);
            });

            window.availableIds = availableIds;
            
            if (batch.length < BATCH_SIZE) hasMore = false;
            offset += BATCH_SIZE;
            
            // Notificar disponibilidad de este lote de tu catálogo
            dispatchBatchEvent(batch);
            
            await new Promise(r => setTimeout(r, 100));
        }

        console.log(`[VivoTV] ✅ Catálogo personal sincronizado: ${availableIds.size} items.`);
        
        // --- ESCANEO DE IDs (Metadatos + Fuentes) ---
        // Esperamos al escaneo para que el modo hibrido tenga datos desde el inicio
        await scanAllDBContent(supabase); 

    } catch (e) {
        console.error('[VivoTV] ❌ Fallo en sincronización de catálogo:', e);
    } finally {
        isSyncing = false;
    }
}

/**
 * ESCANEO MASIVO DE IDs (Para modo híbrido)
 * Recolecta todos los IDs de video_sources y series_episodes en el set global
 */
export async function scanAllDBContent(supabase) {
    if (!supabase) return;
    try {
        console.log('[VivoTV] 🔎 Escaneando fuentes de video para descubrimiento híbrido...');
        
        // Escanear Películas (video_sources)
        const { data: movies } = await supabase.from('video_sources').select('tmdb_id');
        if (movies) movies.forEach(m => {
            const id = m.tmdb_id.toString();
            if (!availableIds.has(id)) {
                availableIds.add(id);
                availableMovies.add(id);
            }
        });

        // Escanear Series (series_episodes)
        const { data: series } = await supabase.from('series_episodes').select('tmdb_id');
        if (series) series.forEach(s => {
            const id = s.tmdb_id.toString();
            if (!availableIds.has(id)) {
                availableIds.add(id);
                availableSeries.add(id);
            }
        });

        // Sincronizar referencias globales
        window.availableIds = availableIds;
        window.availableMovies = availableMovies;
        window.availableSeries = availableSeries;

        console.log(`[VivoTV] 🚀 Escaneo completo. Disponibles para híbrido: ${availableIds.size} títulos.`);
        
        // Notificar que hay nuevos IDs disponibles para habilitar badges o carruseles hibridos
        window.dispatchEvent(new CustomEvent('scanCompleted', { detail: { count: availableIds.size } }));

    } catch (e) {
        console.warn('[VivoTV] Error en escaneo de IDs:', e);
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
            
            const perPage = 12; // Un poco más para compensar filtros
            const start = (page - 1) * perPage;
            const end   = start + perPage;
            let pageIds = allIds.slice(start, end);
            
            if (btnLoadMore) btnLoadMore.classList.toggle('hidden', end >= allIds.length);

            if (pageIds.length) {
                const finalItems = [];
                for (const id of pageIds) {
                    let item = window.DB_CATALOG?.find(i => i.tmdb_id?.toString() === id);
                    if (!item) {
                        try {
                            item = await TMDB_SERVICE.getDetails(id, isMoviesPage ? 'movie' : 'tv');
                        } catch (e) { continue; }
                    }
                    
                    // FILTRADO ESTRICTO: Solo añadir si corresponde a la categoría de la página
                    if (item && validateContentType(item, isMoviesPage ? 'movie' : 'tv')) {
                        finalItems.push(item);
                    }
                }
                
                if (loader) loader.classList.add('hidden');
                
                if (finalItems.length > 0) {
                    const fragment = document.createDocumentFragment();
                    finalItems.forEach(item => {
                        const card = CATALOG_UI.createMovieCard(item, isMoviesPage ? 'movie' : 'tv', true);
                        fragment.appendChild(card);
                    });
                    container.appendChild(fragment);
                } else if (end < allIds.length) {
                    // Si no hubo resultados tras el filtro, intentar con el siguiente lote automáticamente
                    return loadGridData(type, page + 1, true, currentProfile);
                }
            } else {
                if (loader) loader.classList.add('hidden');
            }
            return;
        }

        // --- MODO DESCUBRIMIENTO (Dashboard / Búsqueda) ---
        const data = type === 'tv' ? await TMDB_SERVICE.getPopularTV(page) : await TMDB_SERVICE.getPopularMovies(page);
        if (loader) loader.classList.add('hidden');
        if (data.results?.length) {
            const results = filterItemsByProfile(data.results, currentProfile);
            const fragment = document.createDocumentFragment();
            results.forEach(item => {
                const isAvail = (window.availableIds || availableIds).has(item.id.toString());
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

/**
 * RENDERIZADO HÍBRIDO (DB + TMDB)
 * Muestra contenido de TMDB que el usuario TIENE en su DB (Intersección)
 */
export async function renderHybridRow(containerId, tmdbFunc, type, secondTmdbFunc = null) {
    try {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Limpiar para mostrar loaders o refresh
        container.innerHTML = '';
        
        let allMatches = [];
        const currentIds = window.availableIds || availableIds;

        // 1. Intento de búsqueda en profundidad (Página 1 y Página 2 si es necesario)
        const fetchAndFilter = async (func) => {
            const data = await func();
            if (!data || !data.results) return [];
            return data.results.filter(item => currentIds.has(item.id.toString()));
        };

        allMatches = await fetchAndFilter(tmdbFunc);

        // Si tenemos menos de 5 resultados y la función permite paginación (simulada aquí con fetch adicional)
        if (allMatches.length < 5 && secondTmdbFunc) {
            const extraMatches = await fetchAndFilter(secondTmdbFunc);
            allMatches = [...allMatches, ...extraMatches];
        }

        // 3. Renderizado
        if (allMatches.length > 0) {
            CATALOG_UI.renderCarousel(containerId, allMatches.slice(0, 20), type, currentIds);
            const section = container.closest('.catalog-row');
            if (section) section.classList.remove('hidden');
            window.dispatchEvent(new Event('resize'));
        } else {
            hideRow(containerId);
        }
    } catch (e) {
        console.warn(`[Hybrid] Error en fila ${containerId}:`, e);
        hideRow(containerId);
    }
}

function hideRow(containerId) {
    const container = document.getElementById(containerId);
    const section = container?.closest('.catalog-row');
    if (section) section.classList.add('hidden');
}

export async function renderDBCatalog(containerId, filterType = 'all', isAnime = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // LIMPIEZA PREVENTIVA: Eliminar skeletons de carga antes de validar
    container.innerHTML = '';

    if (!window.DB_CATALOG || window.DB_CATALOG.length === 0) {
        console.warn(`[VivoTV] renderDBCatalog: El catálogo está vacío. Ocultando carrusel ${containerId}`);
        const section = container.closest('.catalog-row');
        if (section) section.classList.add('hidden');
        return;
    }
    
    let items = window.DB_CATALOG;

    // 1. Filtrado Estricto DB-Only
    if (isAnime) {
        items = items.filter(item => {
            return validateContentType(item, 'tv');
        });
    } else if (filterType !== 'all') {
        items = items.filter(item => {
            const type = (item.content_type || '').toLowerCase() === 'series' ? 'tv' : 'movie';
            return type === filterType;
        });
    }

    // 2. Manejo de resultados vacíos
    if (items.length === 0) {
        const section = container.closest('.catalog-row');
        if (section) section.classList.add('hidden');
        return;
    }

    // 3. Renderizado Real
    CATALOG_UI.renderCarousel(containerId, items.slice(0, 20), null, window.availableIds, null, window.DB_CATALOG);
    
    const section = container.closest('.catalog-row');
    if (section) section.classList.remove('hidden');
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
