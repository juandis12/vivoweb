/* ============================================================================
   VivoTV - User Lists & Watch History Module
   Manages My List favorites, recently watched progress, personalized rows, and full history
   ============================================================================ */

/**
 * Returns the currently active profile safely
 */
export function getActiveProfile(fallbackProfile = null) {
    if (fallbackProfile) return fallbackProfile;
    try {
        const stored = localStorage.getItem('vivotv_current_profile');
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
}

/**
 * Loads favorite movies/series for active profile
 */
export async function loadMyList({ supabase, currentProfile, availableIds, CATALOG_UI, TMDB_SERVICE, DB_CATALOG }) {
    const profile = getActiveProfile(currentProfile);
    const section = document.getElementById('myListSection');
    const carousel = document.getElementById('myListCarousel');
    const favoritesGrid = document.getElementById('favoritesGrid');
    const emptyState = document.getElementById('emptyListState');
    
    if (!supabase || !profile) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data: favs } = await supabase.from('user_favorites')
        .select('tmdb_id, type')
        .eq('user_id', user.id)
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false });

    const availSet = availableIds || window.availableIds || new Set();

    // Dedicated favorites page (milista.html)
    if (favoritesGrid) {
        if (!favs || favs.length === 0) {
            favoritesGrid.innerHTML = '';
            emptyState?.classList.remove('hidden');
            return;
        }
        emptyState?.classList.add('hidden');
        
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
            const isAvail = availSet.has(favs[i].tmdb_id?.toString()) || availSet.has(favs[i].tmdb_id);
            const card = CATALOG_UI.createMovieCard(details, favs[i].type || 'movie', isAvail);
            favoritesGrid.appendChild(card);
        });
        return;
    }

    // Home / Dashboard carousel (#myListCarousel)
    if (section && carousel) {
        if (favs?.length) {
            section.classList.remove('hidden');
            const details = await Promise.all(
                favs.slice(0, 15).map(f => TMDB_SERVICE.getDetails(f.tmdb_id, f.type || 'movie').catch(() => null))
            );
            CATALOG_UI.renderCarousel('myListCarousel', details.filter(Boolean), null, availSet, null, DB_CATALOG);
        } else {
            section.classList.add('hidden');
        }
    }
}

/**
 * Loads recently watched items with progress indicator bar
 */
export async function loadRecentlyWatched({ supabase, currentProfile, CATALOG_UI, TMDB_SERVICE }) {
    const profile = getActiveProfile(currentProfile);
    const section = document.getElementById('recentSection');
    const carousel = document.getElementById('recentCarousel');
    if (!section || !carousel || !supabase || !profile) return;

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;
    
    const { data: history } = await supabase.from('watch_history')
        .select('*')
        .eq('user_id', user.id)
        .eq('profile_id', profile.id)
        .order('last_watched', { ascending: false })
        .limit(50);
        
    if (!history?.length) { 
        section.classList.add('hidden'); 
        return; 
    }
    
    carousel.innerHTML = '';
    
    // Deduplicate by tmdb_id so only latest progress shows
    const seen = new Set();
    const unique = history.filter(h => {
        const id = String(h.tmdb_id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });

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

/**
 * Loads personalized recommendations based on profile history and favorites
 */
export async function loadPersonalizedRows({ supabase, currentProfile, availableIds, CATALOG_UI, TMDB_SERVICE, DB_CATALOG }) {
    const profile = getActiveProfile(currentProfile);
    const section = document.getElementById('recommendedSection');
    const carousel = document.getElementById('recommendedCarousel');
    if (!section || !carousel || !supabase || !profile) return;

    try {
        const [{ data: favs }, { data: history }] = await Promise.all([
            supabase.from('user_favorites').select('tmdb_id, type').eq('profile_id', profile.id),
            supabase.from('watch_history').select('tmdb_id, type').eq('profile_id', profile.id).order('last_watched', { ascending: false }).limit(20)
        ]);

        const combinedIds = new Set();
        (favs || []).forEach(f => combinedIds.add(`${f.type}:${f.tmdb_id}`));
        (history || []).forEach(h => combinedIds.add(`${h.type}:${h.tmdb_id}`));

        if (combinedIds.size === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        CATALOG_UI.showSkeletons('recommendedCarousel', 6);

        const details = await Promise.all(Array.from(combinedIds).slice(0, 12).map(async key => {
            const [type, id] = key.split(':');
            return TMDB_SERVICE.getDetails(id, type).catch(() => null);
        }));

        const availSet = availableIds || window.availableIds || new Set();
        const filtered = details.filter(d => d && (availSet.has(d.id.toString()) || availSet.has(d.id)));
        
        if (filtered.length > 0) {
            CATALOG_UI.renderCarousel('recommendedCarousel', filtered, null, availSet, null, DB_CATALOG);
        } else {
            section.classList.add('hidden');
        }
    } catch (e) {
        console.error('Error cargando recomendaciones personalizadas:', e);
        section.classList.add('hidden');
    }
}

/**
 * Loads similar items discovered through TMDB recommendation graph
 */
export async function loadRecommendedItems({ supabase, currentProfile, availableIds, CATALOG_UI, TMDB_SERVICE, DB_CATALOG, filterItemsByProfile }) {
    const profile = getActiveProfile(currentProfile);
    const section = document.getElementById('recommendedSection');
    const carousel = document.getElementById('recommendedCarousel');
    if (!section || !carousel || !supabase || !profile) return;

    try {
        const [{ data: history }, { data: favs }] = await Promise.all([
            supabase.from('watch_history').select('tmdb_id, type').eq('profile_id', profile.id).order('last_watched', { ascending: false }).limit(5),
            supabase.from('user_favorites').select('tmdb_id, type').eq('profile_id', profile.id).order('created_at', { ascending: false }).limit(5)
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

        const recommendationPromises = baseItems.map(h => 
            TMDB_SERVICE.getRecommendations(h.tmdb_id, h.type).catch(() => ({ results: [] }))
        );
        
        const allRes = await Promise.all(recommendationPromises);
        let combinedResults = [];
        allRes.forEach(res => {
            if (res && res.results) combinedResults.push(...res.results);
        });

        const historyIds = new Set((history || []).map(h => h.tmdb_id.toString()));
        const seenInRecs = new Set();
        const availSet = availableIds || window.availableIds || new Set();
        
        let filtered = combinedResults.filter(item => {
            const id = item.id.toString();
            if (seenInRecs.has(id)) return false;
            if (historyIds.has(id)) return false;
            if (!availSet.has(id)) return false;
            seenInRecs.add(id);
            return true;
        });

        if (typeof filterItemsByProfile === 'function') {
            filtered = filterItemsByProfile(filtered);
        }

        if (filtered.length === 0) {
            section.classList.add('hidden');
        } else {
            section.classList.remove('hidden');
            CATALOG_UI.renderCarousel('recommendedCarousel', filtered.slice(0, 20), null, availSet, null, DB_CATALOG);
        }
    } catch (e) {
        console.error('Error en loadRecommendedItems:', e);
        section.classList.add('hidden');
    }
}

/**
 * Loads full watch history on historial.html with 1-click removal
 */
export async function loadFullHistory({ supabase, currentProfile, CATALOG_UI, TMDB_SERVICE }) {
    const profile = getActiveProfile(currentProfile);
    const grid = document.getElementById('historyGrid');
    const emptyState = document.getElementById('emptyHistoryState');
    if (!grid || !supabase || !profile) return;

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data: history } = await supabase.from('watch_history')
        .select('*')
        .eq('user_id', user.id)
        .eq('profile_id', profile.id)
        .order('last_watched', { ascending: false })
        .limit(200);

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
