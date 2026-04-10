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
    
    // Unificar tipo de item (TMDB o DB Local)
    const rawType = item.media_type || (item.content_type === 'series' ? 'tv' : (item.content_type === 'anime' ? 'tv' : (item.content_type === 'movie' ? 'movie' : expectedType)));
    
    // Definición de Anime: Género Animación (16) + (Origen Japonés/Chino/Coreano O Idioma Japonés/Chino/Coreano O Nombre con caracteres Asiáticos)
    const isAnim = genreIds.includes(16);
    const isAsian = (item.origin_country && (Array.isArray(item.origin_country) ? (item.origin_country.includes('JP') || item.origin_country.includes('CN') || item.origin_country.includes('KR')) : ['JP','CN','KR'].includes(item.origin_country))) || 
                    ['ja', 'zh', 'ko'].includes(item.original_language) || 
                    (item.name && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(item.name));

    // Si es Anime en la DB, confiamos en la etiqueta local. Si es de TMDB, combinamos Animación + Origen Asiático.
    const isManuallyMarkedAnime = (item.content_type || '').toLowerCase() === 'anime';
    const isAnime = isManuallyMarkedAnime || (isAnim && isAsian);

    const isMoviesPage = document.body.classList.contains('page-movies');
    const isSeriesPage = document.body.classList.contains('page-series');
    const isAnimePage  = document.body.classList.contains('page-anime');

    // VALIDACIÓN CRUZADA: Item vs Página
    if (isAnimePage) return isAnime;
    if (isSeriesPage) return rawType === 'tv' && !isAnime;
    if (isMoviesPage) return rawType === 'movie' && !isAnime;
    
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

        // MODO BIBLIOTECA: Filtrar por lo que el usuario TIENE en DB
        if (isMoviesPage || isSeriesPage || isAnimePage) {
            // Unificar IDs de disponibilidad (Priority: DB Scan)
            let targetSet;
            if (isMoviesPage) targetSet = window.availableMovies;
            else if (isSeriesPage) targetSet = window.availableSeries;
            else if (isAnimePage) targetSet = new Set([...(window.availableMovies || []), ...(window.availableSeries || [])]);

            const allIds = Array.from(targetSet || []);
            
            if (allIds.length === 0) {
                if (loader) loader.classList.add('hidden');
                if (!append) container.innerHTML = '<p class=\"no-results-msg\">No tienes contenido en esta sección todavía.</p>';
                if (btnLoadMore) btnLoadMore.classList.add('hidden');
                return;
            }

            const perPage = 20;
            const startIdx = (page - 1) * perPage;
            const endIdx = startIdx + perPage;
            const pageIds = allIds.slice(startIdx, endIdx);

            const finalItems = [];
            for (const id of pageIds) {
                // 1. Buscar en cache de metadatos (DB_CATALOG)
                let item = (window.DB_CATALOG || []).find(i => i.tmdb_id?.toString() === id.toString());
                
                // 2. Fallback: TMDB Details si no hay metadatos locales
                if (!item) {
                    try {
                        // Intentar como serie primero si estamos en Anime o Series, sino como movie
                        const typeToTry = (isSeriesPage || isAnimePage) ? 'tv' : 'movie';
                        item = await TMDB_SERVICE.getDetails(id, typeToTry);
                        
                        // Si falla como TV y estamos en Anime, intentar como movie (Anime Movies)
                        if ((!item || !item.id) && isAnimePage) {
                            item = await TMDB_SERVICE.getDetails(id, 'movie');
                        }
                    } catch (e) { continue; }
                }

                // 3. Validar tipo y añadir
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
                
                if (btnLoadMore) {
                    btnLoadMore.classList.toggle('hidden', endIdx >= allIds.length);
                    btnLoadMore.onclick = () => loadGridData(type, page + 1, true, currentProfile);
                }
            } else if (endIdx < allIds.length) {
                // Si este lote no tuvo matches tras filtro, intentar siguiente
                return loadGridData(type, page + 1, true, currentProfile);
            } else if (!append && container.innerHTML === '') {
                container.innerHTML = '<p class=\"no-results-msg\">No hay títulos que coincidan con los filtros de esta sección.</p>';
            }
            return;
        }

        // MODO DESCUBRIMIENTO (Inicio / Búsqueda)
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
            
            if (btnLoadMore) {
                btnLoadMore.classList.toggle('hidden', data.page >= data.total_pages);
                btnLoadMore.onclick = () => loadGridData(type, page + 1, true, currentProfile);
            }
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
export async function renderHybridRow(containerId, tmdbFunc, type, secondTmdbFunc = null, genreId = null) {
    try {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';
        const currentIds = window.availableIds || availableIds;

        // 1. Extraer de Database Local (Prioridad)
        let dbMatches = [];
        if (genreId && window.DB_CATALOG) {
            dbMatches = window.DB_CATALOG.filter(item => {
                const genresArr = item.genres || item.genre_ids || [];
                const gIds = genresArr.map(g => typeof g === 'object' ? g.id : g);
                return gIds.includes(parseInt(genreId)) && validateContentType(item, type);
            });
        }

        // 2. Extraer de TMDB
        const fetchFn = async (func) => {
            const data = await func();
            return data?.results || [];
        };

        let tmdbResults = await fetchFn(tmdbFunc);
        if (tmdbResults.length < 10 && secondTmdbFunc) {
            const extra = await fetchFn(secondTmdbFunc);
            tmdbResults = [...tmdbResults, ...extra];
        }

        // 3. Combinar y FILTRAR por disponibilidad real (Solo lo que está en DB)
        const seenIds = new Set(dbMatches.map(m => (m.id || m.tmdb_id).toString()));
        const availableTmdb = tmdbResults.filter(m => {
            const id = (m.id || m.tmdb_id).toString();
            return currentIds.has(id) && !seenIds.has(id);
        });

        let finalItems = [...dbMatches, ...availableTmdb];
        
        finalItems = filterItemsByProfile(finalItems).slice(0, 20);

        if (finalItems.length > 0) {
            CATALOG_UI.renderCarousel(containerId, finalItems, type, currentIds);
            const section = container.closest('.catalog-row');
            if (section) section.classList.remove('hidden');
            window.dispatchEvent(new Event('resize'));
        } else {
            hideRow(containerId);
        }
    } catch (e) {
        console.error(`Error en hybrid row ${containerId}:`, e);
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
