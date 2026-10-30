/* ============================================================================
   VivoTV Player - State Module
   ============================================================================ */
let _supabase = null;
let _currentServers = [];

export function getSupabase() {
    return _supabase;
}

export function setSupabaseClient(client) {
    _supabase = client;
}

export function getCurrentServers() {
    return _currentServers;
}

export function setCurrentServers(servers) {
    _currentServers = servers;
}

export const defaultPlayerState = {
    hls: null,
    currentUserId: null,
    currentTmdbId: null,
    currentType: null,
    currentSeason: null,
    currentEpisode: null,
    seriesData: null,
    lastSeriesProgress: null,
    progressTimer: null,
    trailerTimer: null,
    marathonTimer: null,
    currentPlaybackTitle: null,
    ytPlayer: null,
    vimeoPlayer: null,
    sdksLoaded: false,
    iframeElapsed: 0,
    currentSourceIndex: 0,
    currentSources: []
};
