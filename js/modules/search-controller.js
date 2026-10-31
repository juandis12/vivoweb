/* ============================================================================
   VivoTV - Search Controller Module
   Unified search engine: multi-search, vibe chips, filters, and batch rendering
   ============================================================================ */

let lastSearchResults = [];
let currentFilter = 'all';
let searchTimeout = null;

/**
 * Initializes the dedicated Search page (busqueda.html)
 */
export function initSearchPage(onExecute) {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    
    const headerTitle = document.getElementById('searchHeader');
    const mainInput   = document.getElementById('mainSearchInput');
    const filterPills = document.querySelectorAll('.filter-pill');
    const searchInput = document.getElementById('searchInput');

    if (q) {
        if (headerTitle) headerTitle.textContent = `Resultados para "${q}"`;
        if (mainInput)   mainInput.value = q;
        if (searchInput) searchInput.value = q;
        
        if (onExecute) onExecute(q);
    }

    if (mainInput) {
        mainInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (searchInput) searchInput.value = val;
            
            if (searchTimeout) clearTimeout(searchTimeout);
            if (val.length < 3) return;

            searchTimeout = setTimeout(() => {
                if (onExecute) onExecute(val);
            }, 450);
        });
    }

    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentFilter = pill.dataset.filter || 'all';
            applyLocalFilter();
        });
    });
}

/**
 * Executes TMDB multi-search with profile filtering and available ID priority
 */
export async function executeSearch(query, { TMDB_SERVICE, filterItemsByProfile, availableIds, CATALOG_UI }) {
    const grid = document.getElementById('searchResultsGrid');
    if (!grid) return;

    CATALOG_UI.showSkeletons('searchResultsGrid', 12);
    
    try {
        const res = await TMDB_SERVICE.fetchFromTMDB('/search/multi', { query });
        if (res && res.results) {
            let results = res.results.filter(item => item.media_type !== 'person');
            if (typeof filterItemsByProfile === 'function') {
                results = filterItemsByProfile(results);
            }

            // Prioritize titles available in database
            const availSet = availableIds || new Set();
            results.sort((a, b) => {
                const availA = availSet.has(a.id?.toString()) || availSet.has(a.id) ? 1 : 0;
                const availB = availSet.has(b.id?.toString()) || availSet.has(b.id) ? 1 : 0;
                return availB - availA;
            });

            lastSearchResults = results;
            applyLocalFilter(CATALOG_UI, availSet);

            const newUrl = new URL(window.location);
            newUrl.searchParams.set('q', query);
            window.history.pushState({}, '', newUrl);
        }
    } catch (e) {
        console.error('Search error:', e);
    }
}

/**
 * Applies active category pill filter to cached search results
 */
export function applyLocalFilter(CATALOG_UI, availableIds) {
    let filtered = [...lastSearchResults];
    
    if (currentFilter === 'movie') {
        filtered = filtered.filter(i => i.media_type === 'movie');
    } else if (currentFilter === 'tv') {
        filtered = filtered.filter(i => i.media_type === 'tv' && !i.genre_ids?.includes(16));
    } else if (currentFilter === 'anime') {
        filtered = filtered.filter(i => i.genre_ids?.includes(16));
    }

    renderSearchResults(filtered, CATALOG_UI, availableIds);
}

/**
 * Renders search results with DocumentFragment and stagger animation
 */
export function renderSearchResults(results, CATALOG_UI, availableIds) {
    const grid = document.getElementById('searchResultsGrid');
    const empty = document.getElementById('noResultsState');
    if (!grid) return;

    grid.innerHTML = '';
    
    if (!results || results.length === 0) {
        if (empty) empty.classList.remove('hidden');
        return;
    }

    if (empty) empty.classList.add('hidden');
    
    const fragment = document.createDocumentFragment();
    const availSet = availableIds || window.availableIds || new Set();

    results.forEach((item, index) => {
        const type = item.media_type || (item.title ? 'movie' : 'tv');
        const isAvail = availSet.has(item.id?.toString()) || availSet.has(item.id);
        const card = CATALOG_UI.createMovieCard(item, type, isAvail);
        
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        fragment.appendChild(card);
        
        setTimeout(() => {
            card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 25);
    });

    grid.appendChild(fragment);
}

/**
 * Global navbar search box setup (works across all pages)
 */
export function initNavbarSearch({ searchBox, searchInput, btnClear, availableIds, filterItemsByProfile, TMDB_SERVICE, CATALOG_UI, DB_CATALOG }) {
    if (!searchBox || !searchInput) return;

    searchBox.onclick = (e) => {
        searchBox.classList.add('active');
        searchInput.focus();
        e.stopPropagation();
    };

    if (!window._searchBoxListenerBound) {
        document.addEventListener('click', (e) => {
            const currentSearchBox = document.getElementById('searchBox');
            if (currentSearchBox && !currentSearchBox.contains(e.target)) {
                currentSearchBox.classList.remove('active');
            }
        });
        window._searchBoxListenerBound = true;
    }

    if (btnClear) {
        btnClear.onclick = () => {
            searchInput.value = '';
            btnClear.classList.add('hidden');
        };
    }

    let navSearchTimeout = null;
    searchInput.oninput = (e) => {
        const q = e.target.value.trim();
        if (btnClear) btnClear.classList.toggle('hidden', q.length === 0);

        if (navSearchTimeout) clearTimeout(navSearchTimeout);
        if (q.length < 3) return;

        navSearchTimeout = setTimeout(async () => {
            const isSearchPage = window.location.pathname.includes('busqueda.html');
            if (isSearchPage) {
                executeSearch(q, { TMDB_SERVICE, filterItemsByProfile, availableIds, CATALOG_UI });
            } else {
                const res = await TMDB_SERVICE.fetchFromTMDB('/search/multi', { query: q });
                if (res && res.results) {
                    const availSet = availableIds || window.availableIds || new Set();
                    let filtered = res.results.filter(item => availSet.has(item.id?.toString()) || availSet.has(item.id));
                    if (typeof filterItemsByProfile === 'function') filtered = filterItemsByProfile(filtered);

                    const isMoviesPage = document.body.classList.contains('page-movies');
                    const isSeriesPage = document.body.classList.contains('page-series');
                    const targetId = isMoviesPage ? 'popularCarousel' : (isSeriesPage ? 'popularCarousel' : 'trendingCarousel');
                    CATALOG_UI.renderCarousel(targetId, filtered, null, availSet, `🔍 Resultados para "${q}"`, DB_CATALOG);
                }
            }
        }, 400);
    };

    searchInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            const q = searchInput.value.trim();
            if (q.length >= 3) {
                window.location.href = `busqueda.html?q=${encodeURIComponent(q)}`;
            }
        }
    };
}

/**
 * Initializes vibe & mood chips on search page
 */
export function initMoodChips({ CATALOG_UI }) {
    const moodChips = document.getElementById('moodChips');
    if (!moodChips) return;

    moodChips.querySelectorAll('.mood-chip').forEach(chip => {
        chip.onclick = async () => {
            const mood = chip.dataset.mood;
            const { filterByMood } = await import('../catalog.js');
            
            moodChips.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const results = filterByMood(window.DB_CATALOG || [], mood);
            const grid = document.getElementById('searchResultsGrid');
            
            if (grid) {
                grid.innerHTML = '';
                if (results.length === 0) {
                    document.getElementById('noResultsState')?.classList.remove('hidden');
                } else {
                    document.getElementById('noResultsState')?.classList.add('hidden');
                    results.forEach(item => {
                        const card = CATALOG_UI.createMovieCard(item, item.media_type || 'movie', true, null, null);
                        grid.appendChild(card);
                    });
                }
            }
            
            const searchHeader = document.getElementById('searchHeader');
            if (searchHeader) searchHeader.textContent = `Vibra: ${chip.textContent}`;
        };
    });
}
