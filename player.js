import { CONFIG } from './config.js';
import { TMDB_SERVICE } from './tmdb.js';
import { showToast } from './utils.js';
import { CATALOG_UI } from './ui.js'; // Solo se usa en funciones, pero evitamos import preventivo si es posible

let _supabase = null;
let _currentServers = [];
export function setSupabase(client) { _supabase = client; }

export const PLAYER_LOGIC = {
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

    // CARGA DINÁMICA DE SDKS (Optimización Mobile 10X)
    async _ensureVideoSDKs() {
        if (this.sdksLoaded) return;
        
        console.log('[Player] Cargando SDKs de video bajo demanda...');
        const scripts = [
            'https://cdn.jsdelivr.net/npm/hls.js@latest',
            'https://www.youtube.com/iframe_api',
            'https://player.vimeo.com/api/player.js'
        ];

        await Promise.all(scripts.map(src => {
            return new Promise((resolve) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = resolve;
                s.onerror = resolve; // Continuar aunque uno falle
                document.head.appendChild(s);
            });
        }));

        this.sdksLoaded = true;
        console.log('[Player] SDKs listos.');
    },

    // UI: Selector de Servidores
    showServerSelector(servers, seek = 0) {
        _currentServers = servers;
        let selector = document.getElementById('serverSelector');
        if (!selector) {
            selector = document.createElement('div');
            selector.id = 'serverSelector';
            selector.className = 'server-selector-overlay';
            document.getElementById('playerContainer').appendChild(selector);
        }

        selector.innerHTML = `
            <div class="selector-content">
                <h3>Seleccionar Servidor</h3>
                <div class="server-list">
                    ${servers.map((s, idx) => `
                        <button class="server-btn ${idx === 0 ? 'active' : ''}" 
                                onclick="window.PLAYER_LOGIC.switchServer(${idx}, ${seek})">
                            <span class="server-icon">📡</span>
                            <div class="server-info">
                                <span class="server-name">${s.name}</span>
                                <span class="server-desc">${s.url.includes('vimeus') ? 'Recomendado' : 'Alternativo'}</span>
                            </div>
                        </button>
                    `).join('')}
                </div>
                <button class="btn-close-selector" onclick="document.getElementById('serverSelector').classList.remove('visible')">Cerrar</button>
            </div>
        `;
        
        // Exponer función de cambio al objeto global para los clics en HTML inyectado
        window.PLAYER_LOGIC.switchServer = (index, sSeconds) => {
            const server = _currentServers[index];
            if (!server) return;
            
            // UI Feedback
            const btns = document.querySelectorAll('.server-btn');
            btns.forEach((b, i) => b.classList.toggle('active', i === index));
            
            // Guardar progreso actual antes de cambiar
            const video = document.getElementById('videoPlayer');
            const currentTime = video ? video.currentTime : sSeconds;
            
            this._playSource(server.url, currentTime);
            showToast(`Cambiando a ${server.name}...`, 'info');
            
            // Ocultar selector tras elegir
            setTimeout(() => selector.classList.remove('visible'), 500);
        };

        // Mostrar con delay para animación
        setTimeout(() => selector.classList.add('visible'), 100);
    },

    // Mini Player Toggle
    toggleMiniPlayer(active) {
        const container = document.getElementById('playerContainer');
        const miniContainer = document.getElementById('miniPlayerContainer');
        if (!container || !miniContainer) return;

        if (active) {
            miniContainer.classList.add('active');
            miniContainer.appendChild(container);
            container.classList.add('is-mini');
        } else {
            miniContainer.classList.remove('active');
            // Re-insertar en el slot original del DOM si existe
            const originalSlot = document.getElementById('modalMainContent');
            if (originalSlot) originalSlot.prepend(container);
            container.classList.remove('is-mini');
        }
    },

    // Helper para formatear segundos a HH:MM:SS o MM:SS
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        let res = '';
        if (hrs > 0) res += (hrs < 10 ? '0' + hrs : hrs) + ':';
        res += (mins < 10 ? '0' + mins : mins) + ':';
        res += (secs < 10 ? '0' + secs : secs);
        return res;
    },

    _stopTrailer() {
        if (this.trailerTimer) {
            clearTimeout(this.trailerTimer);
            this.trailerTimer = null;
        }
        const iframe = document.getElementById('trailerIframe');
        if (iframe) {
            iframe.src = '';
            iframe.style.opacity = '0';
        }
        const container = document.querySelector('.auto-trailer-container');
        const backdrop = document.getElementById('modalBackdrop');
        if (backdrop) backdrop.classList.remove('fade-out');
        if (container) {
            container.classList.remove('visible');
            setTimeout(() => container.remove(), 1000);
        }
    },

    async _startAutoplayTrailer(tmdbId, type) {
        // En un escenario real, buscaríamos la clave de Youtube del Tráiler en TMDB
        // Por ahora, solo evitamos el crash silenciosamente.
        console.log(`[VivoTV] Reproduciría Trailer de ${tmdbId} aquí.`);
    },

    async openDetail(tmdbId, type = 'movie', supabaseClient, availableIds = new Set()) {
        this._stopTrailer(); // Detener tráiler previo si existe
        this.availableIds = availableIds; // Guardar para uso en similares
        _supabase = supabaseClient;
        this.currentTmdbId = tmdbId;
        this.currentType = type;
        this.currentSeason = null;
        this.currentEpisode = null;
        this._stopProgressTimer();

        const modal = document.getElementById('detailModal');
        const mainContent = document.getElementById('modalMainContent');
        const playerContainer = document.getElementById('playerContainer');
        const videoPlayer = document.getElementById('videoPlayer');
        const videoIframe = document.getElementById('videoIframe');
        const seriesInfo = document.getElementById('seriesInfo');
        const trending = document.getElementById('trendingBadge');

        modal.classList.remove('hidden');
        document.documentElement.classList.add('no-scroll');
        document.body.classList.add('no-scroll');
        playerContainer.classList.add('hidden');
        mainContent.classList.remove('hidden');
        trending.classList.add('hidden');
        seriesInfo.classList.add('hidden');

        if (this.hls) { this.hls.destroy(); this.hls = null; }
        videoPlayer.pause();
        videoPlayer.src = '';
        videoIframe.src = '';
        videoPlayer.classList.add('hidden');
        videoIframe.classList.add('hidden');

        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            this.currentUserId = user?.id;

            const details = await TMDB_SERVICE.getDetails(tmdbId, type);
            const credits = await TMDB_SERVICE.getCredits(tmdbId, type);
            this.updateModalUI(details, credits, availableIds);

            if (details.popularity > 500) trending.classList.remove('hidden');

            // --- TRÁILER AUTOMÁTICO (Netflix Style) ---
            // Iniciamos el temporizador de 10 segundos
            this.trailerTimer = setTimeout(() => {
                this._startAutoplayTrailer(tmdbId, type);
            }, 10000); 

            if (type === 'tv' || details.media_type === 'tv') {
                this.seriesData = details;
                await this.detectGlobalSeriesProgress(tmdbId, supabaseClient);
                await this.renderSeriesInfo(details, supabaseClient);
                seriesInfo.classList.remove('hidden');
            } else {
                this.movieData = details;
                // Verificamos si hay progreso en película para mostrar la tarjeta flotante
                await this._checkMovieProgress(tmdbId, supabaseClient);
            }

            const btnPlay = document.getElementById('btnModalPlay');
            btnPlay.onclick = async () => {
                this._stopTrailer();
                // Asegurar SDKs antes de cualquier reproducción
                await this._ensureVideoSDKs();

                if (type === 'tv' || details.media_type === 'tv') {
                    // SI ES SERIE: BUSCAR ÚLTIMO VISTO O E1 PARA PLAY INMEDIATO
                    const targetEp = this.lastSeriesProgress || { season_number: 1, episode_number: 1 };
                    const { data: epData } = await supabaseClient.from('series_episodes')
                        .select('stream_url')
                        .eq('tmdb_id', Number(tmdbId))
                        .eq('season_number', targetEp.season_number)
                        .eq('episode_number', targetEp.episode_number)
                        .maybeSingle();

                    if (epData) {
                        this.currentSeason = targetEp.season_number;
                        this.currentEpisode = targetEp.episode_number;
                        this._playEpisode(tmdbId, targetEp.season_number, epData, supabaseClient, targetEp.progress_seconds || 0);
                    } else {
                        // Fallback si no hay stream: scroll a la lista
                        seriesInfo.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        showToast('Selecciona un episodio disponible');
                    }
                } else {
                    await this._loadMovieSource(tmdbId, supabaseClient);
                }
            };
            
            // FASE 4: Evento de Watch Party (vincular al botón Compartir)
            const btnShareList = document.querySelectorAll('.btn-share');
            btnShareList.forEach(btnShare => {
                // Clonar para limpiar eventos previos
                const newBtnShare = btnShare.cloneNode(true);
                
                // Actualizar visualmente para que sea obvio que es de Watch Party
                newBtnShare.innerHTML = `<span style="font-size:1.2rem; margin-right:8px;">🎉</span> Iniciar Watch Party`;
                newBtnShare.style.background = 'linear-gradient(135deg, rgba(88, 28, 135, 0.8), rgba(126, 34, 206, 0.9))';
                newBtnShare.style.border = '1px solid rgba(216, 180, 254, 0.5)';
                newBtnShare.style.boxShadow = '0 10px 20px rgba(126, 34, 206, 0.4)';
                
                btnShare.parentNode.replaceChild(newBtnShare, btnShare);
                
                newBtnShare.onclick = async () => {
                    showToast('Creando sala de Watch Party...', 'info');
                    const { createPartyUI } = await import('./watch-party-ui.js');
                    createPartyUI(tmdbId, type);
                };
            });


            const btnExit = document.getElementById('btnExitPlayer');
            btnExit.onclick = () => {
                if (window.SOCIAL_PULSE) window.SOCIAL_PULSE.detach();
                this.toggleMiniPlayer(false);
                playerContainer.classList.add('hidden');
                videoPlayer.pause();
                videoIframe.src = '';
                const helpBtn = document.getElementById('watchPartyHelpBtn');
                if (helpBtn) helpBtn.style.display = 'flex';
            };

            const btnMinimize = document.getElementById('btnMinimizePlayer');
            if (btnMinimize) {
                btnMinimize.onclick = () => {
                    this.toggleMiniPlayer(true);
                    playerContainer.classList.add('hidden'); // Ocultar el fullscreen original
                };
            }

            // Aplicar Interfaz Adaptativa (XPTV Style)
            CATALOG_UI.applyAdaptiveTheme(TMDB_SERVICE.getImageUrl(details.backdrop_path));

            this.checkIfFavorite(supabaseClient);
        } catch (err) {
            console.error('Error openDetail:', err);
            showToast('Error al cargar detalles');
        }
    },

    updateModalUI(data, credits = null, availableIds = new Set()) {
        document.getElementById('modalTitle').textContent = data.title || data.name;
        document.getElementById('modalOverview').textContent = data.overview || 'Sin descripción disponible.';
        
        const bdp = document.getElementById('modalBackdrop');
        if (data.backdrop_path) {
            bdp.style.backgroundImage = `url('${CONFIG.TMDB_IMAGE_BASE}${data.backdrop_path}')`;
        }

        document.getElementById('modalYear').textContent = (data.release_date || data.first_air_date || '-').split('-')[0];
        document.getElementById('modalRuntime').textContent = data.runtime ? `${data.runtime} min` : (data.number_of_seasons ? `${data.number_of_seasons} Temporadas` : '-');
        document.getElementById('modalRating').textContent = `★ ${data.vote_average?.toFixed(1) || 'N/A'}`;

        document.getElementById('infoRelease').textContent = data.release_date || data.first_air_date || '-';
        const directorObj = credits?.crew?.find(c => c.job === 'Director');
        document.getElementById('infoDirector').textContent = directorObj ? directorObj.name : '-';

        const castGrid = document.getElementById('modalCast');
        if (castGrid && credits?.cast) {
            castGrid.innerHTML = '';
            credits.cast.slice(0, 8).forEach(actor => {
                const photo = actor.profile_path ? `${CONFIG.TMDB_IMAGE_CARD}${actor.profile_path}` : 'https://via.placeholder.com/150x150?text=SIN+FOTO';
                const item = document.createElement('div');
                item.className = 'cast-item';
                item.innerHTML = `
                    <div class="cast-avatar-w"><img src="${photo}" alt="${actor.name}" loading="lazy"></div>
                    <div class="cast-info">
                        <p class="cast-name">${actor.name}</p>
                        <p class="cast-char">${actor.character}</p>
                    </div>
                `;
                castGrid.appendChild(item);
            });
        }

        // --- RELACIONADOS (More Like This) ---
        CATALOG_UI.renderSimilar(data.id, data.title ? 'movie' : 'tv', availableIds);
    },


    async _checkMovieProgress(tmdbId, supabaseClient) {
        const progressObj = await this._getProgress(tmdbId, 'movie', 0, 0, supabaseClient);
        const savedSecs = progressObj?.progress_seconds || 0;
        const btnPlay = document.getElementById('btnModalPlay');

        if (savedSecs > 60) {
            btnPlay.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Continuar (${this.formatTime(savedSecs)})`;
            this.showFloatingResumeCard({
                thumb: `${CONFIG.TMDB_IMAGE_CARD}${this.movieData?.poster_path || ''}`,
                title: '¿Continuar viendo?',
                desc: `Te quedaste en el minuto ${this.formatTime(savedSecs)}`,
                onResume: async () => {
                    const { data } = await supabaseClient.from('video_sources').select('stream_url').eq('tmdb_id', String(tmdbId)).maybeSingle();
                    if (data?.stream_url) this._playSource(data.stream_url, savedSecs);
                }
            });
        } else {
            btnPlay.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Reproducir ahora`;
        }
    },

    async _loadMovieSource(tmdbId, supabaseClient) {
        const { data, error } = await supabaseClient.from('video_sources')
            .select('stream_url, stream_url_vidsrc, stream_url_2embed, stream_url_superembed')
            .eq('tmdb_id', Number(tmdbId))
            .maybeSingle();

        if (error || !data) {
            showToast('Fuente no disponible.');
        } else {
            const progressObj = await this._getProgress(tmdbId, 'movie', 0, 0, supabaseClient);
            const seek = progressObj?.progress_seconds || 0;

            const servers = [
                { name: 'Vimeus (Principal)', url: data.stream_url },
                { name: 'Servidor VIP 1', url: data.stream_url_vidsrc },
                { name: 'Servidor VIP 2', url: data.stream_url_2embed },
                { name: 'Servidor Directo', url: data.stream_url_superembed }
            ].filter(s => s.url && s.url.trim() !== '');

            if (servers.length > 1) {
                this.showServerSelector(servers, seek);
            }

            // ── NEXT-GEN HOOKS ──
            if (window.SOCIAL_PULSE) window.SOCIAL_PULSE.attach(tmdbId, 'movie');
            if (window.ACHIEVEMENTS) window.ACHIEVEMENTS.track('play_video', {
                type: 'movie',
                genre: this.movieData?.genres?.[0]?.id
            });

            this._playSource(servers[0].url, seek);
        }
    },

    async renderSeriesInfo(data, supabaseClient) {
        const infoStatus = document.getElementById('infoStatus');
        if (infoStatus) infoStatus.textContent = data.status === 'Ended' ? 'Finalizada' : 'En Emisión';

        const seasons = (data.seasons || [])
            .filter(s => s.season_number > 0)
            .sort((a, b) => a.season_number - b.season_number);
        const pillsContainer = document.getElementById('seasonsPills');
        const grid = document.getElementById('episodesGrid');

        if (pillsContainer) {
            pillsContainer.innerHTML = '';
            seasons.forEach(season => {
                const pill = document.createElement('div');
                pill.className = 'season-pill';
                pill.textContent = `Temporada ${season.season_number}`;
                pill.dataset.season = season.season_number;
                pill.onclick = () => this.switchSeason(season.season_number, supabaseClient);
                pillsContainer.appendChild(pill);
            });
        }

        // 2. CARGAR TEMPORADA INICIAL (La última vista o la T1)
        const initialSeason = this.lastSeriesProgress?.season_number || (seasons[0]?.season_number || 1);
        await this.switchSeason(initialSeason, supabaseClient);

        // 3. TARJETA FLOTANTE DE REANUDACIÓN
        if (this.lastSeriesProgress) {
            const p = this.lastSeriesProgress;
            this.showFloatingResumeCard({
                thumb: `${CONFIG.TMDB_IMAGE_CARD}${this.seriesData?.poster_path || ''}`,
                title: p.progress_seconds > ((this.seriesData?.last_episode_to_air?.runtime || 45) * 60 * 0.95) ? 'Ver Siguiente' : 'Continuar Serie',
                desc: `T${p.season_number} E${p.episode_number} • ${this.formatTime(p.progress_seconds)}`,
                onResume: () => {
                    const isFinished = p.progress_seconds > ((this.seriesData?.last_episode_to_air?.runtime || 45) * 60 * 0.95);
                    if (isFinished) {
                        this.playNextEpisodeFrom(p.season_number, p.episode_number, supabaseClient);
                    } else {
                        this.resumeLastEpisode(p.season_number, p.episode_number, p.progress_seconds, supabaseClient);
                    }
                }
            });
        }
    },

    async switchSeason(seasonNum, supabaseClient) {
        const pills = document.querySelectorAll('.season-pill');
        pills.forEach(p => {
            p.classList.toggle('active', parseInt(p.dataset.season) === parseInt(seasonNum));
        });

        const grid = document.getElementById('episodesGrid');
        grid.innerHTML = '<div class="marathon-loader"><div class="loader"></div><p>Cargando episodios...</p></div>';

        try {
            // Cargar datos de TMDB y Supabase en paralelo
            const [seasonData, dbEps] = await Promise.all([
                TMDB_SERVICE.getSeasonDetails(this.currentTmdbId, seasonNum),
                supabaseClient.from('series_episodes')
                    .select('episode_number, stream_url, stream_url_vidsrc, stream_url_2embed, stream_url_superembed')
                    .eq('tmdb_id', Number(this.currentTmdbId))
                    .eq('season_number', Number(seasonNum))
            ]);

            const episodes = (seasonData.episodes || []).map(ep => {
                const dbEp = (dbEps.data || []).find(d => d.episode_number === ep.episode_number);
                return { 
                    ...ep, 
                    stream_url: dbEp?.stream_url,
                    stream_url_vidsrc: dbEp?.stream_url_vidsrc,
                    stream_url_2embed: dbEp?.stream_url_2embed,
                    stream_url_superembed: dbEp?.stream_url_superembed
                };
            });

            this._renderEpisodes(seasonNum, episodes, supabaseClient);
        } catch (err) {
            console.error('Error cargando temporada:', err);
            grid.innerHTML = '<p class="error-msg">Error al cargar la temporada.</p>';
        }
    },

    async _renderEpisodes(seasonNum, episodes, supabaseClient) {
        const grid = document.getElementById('episodesGrid');
        grid.innerHTML = '';

        // FIX: 'profile' no está en scope — leer desde localStorage igual que el resto de la app
        const currentProfile = JSON.parse(localStorage.getItem('vivotv_current_profile'));

        // Obtener progreso de esta temporada
        let progressMap = {};
        if (currentProfile?.id) {
            const { data: hist } = await supabaseClient.from('watch_history')
                .select('episode_number, progress_seconds')
                .eq('profile_id', currentProfile.id)
                .eq('tmdb_id', Number(this.currentTmdbId))
                .eq('season_number', Number(seasonNum));
            
            (hist || []).forEach(h => progressMap[h.episode_number] = h);
        }

        const runtimeMap = {};
        episodes.forEach(e => runtimeMap[e.episode_number] = e.runtime || 45); // Fallback runtime

        episodes.forEach(ep => {
            const card = document.createElement('div');
            const hasStream = !!ep.stream_url;
            card.className = `episode-card${!hasStream ? ' disabled' : ''}`;
            
            const progress = progressMap[ep.episode_number];
            const isWatched = progress && progress.progress_seconds > 0;
            const thumb = ep.still_path ? 
                `${CONFIG.TMDB_IMAGE_CARD}${ep.still_path}` : 
                (this.seriesData?.backdrop_path ? `${CONFIG.TMDB_IMAGE_CARD}${this.seriesData.backdrop_path}` : '');

            card.innerHTML = `
                <div class="ep-thumb-wrapper">
                    <img src="${thumb}" class="ep-thumb" alt="E${ep.episode_number}" loading="lazy">
                    ${hasStream ? `<div class="ep-play-overlay"><svg viewBox="0 0 24 24" width="24" height="24" fill="#fff"><path d="M8 5v14l11-7z"/></svg></div>` : ''}
                    
                    ${(() => {
                        const prog = progressMap[ep.episode_number];
                        if (!prog) return '';
                        const totalSecs = (ep.runtime || 45) * 60;
                        const isFullyWatched = prog.progress_seconds > (totalSecs * 0.90); // Fase Precision: 90%
                        
                        if (isFullyWatched) {
                            return `<div class="watched-badge watched-premium"><svg viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> VISTO</div>`;
                        } else if (prog.progress_seconds > 10) { // Mostrar barra si hay más de 10s
                            const pct = Math.min((prog.progress_seconds / totalSecs) * 100, 100);
                            return `<div class="ep-progress-bar"><div class="progress-fill" style="width: ${pct}%"></div></div>`;
                        }
                        return '';
                    })()}
                </div>
                <div class="ep-info">
                    <div class="ep-header-row">
                        <h4 class="ep-title">E${ep.episode_number}. ${ep.name || 'Episodio ' + ep.episode_number}</h4>
                        <span class="ep-status ${hasStream ? 'status-available' : 'status-upcoming'}">${hasStream ? 'Disponible' : 'Próximamente'}</span>
                    </div>
                    <p class="ep-overview">${ep.overview || 'Sin descripción disponible.'}</p>
                    <p class="ep-meta">${ep.runtime || '?'} min</p>
                </div>
            `;

            if (hasStream) {
                card.onclick = () => {
                    this.currentSeason = seasonNum;
                    this.currentEpisode = ep.episode_number;
                    this._playEpisode(this.currentTmdbId, seasonNum, ep, supabaseClient, progress?.progress_seconds || 0);
                };
            }
            grid.appendChild(card);
        });
    },

    async _playEpisode(tmdbId, seasonNum, ep, supabaseClient, seekSeconds = 0) {
        this._stopTrailer();
        this._cancelMarathon();
        this.currentSeason = seasonNum;
        this.currentEpisode = ep.episode_number;

        // Guardar nombre para telemetría (Inmediato)
        this.currentPlaybackTitle = `${this.seriesData?.name || 'Serie'} (T${seasonNum}:E${ep.episode_number})`;
        if (window.updateGlobalPlaybackStatus) {
            window.updateGlobalPlaybackStatus({ title: this.currentPlaybackTitle, type: 'tv' });
        }

        // ── NEXT-GEN HOOKS ──
        // Social Pulse: mostrar barra de reacciones en tiempo real
        if (window.SOCIAL_PULSE) window.SOCIAL_PULSE.attach(tmdbId, 'tv');
        // Achievements: trackear reproducción de episodio
        if (window.ACHIEVEMENTS) window.ACHIEVEMENTS.track('play_video', {
            type: 'tv',
            genre: this.seriesData?.genres?.[0]?.id
        });

        // Preparar servidores para series
        const servers = [
            { name: 'Vimeus (Principal)', url: ep.stream_url },
            { name: 'Servidor VIP 1', url: ep.stream_url_vidsrc },
            { name: 'Servidor VIP 2', url: ep.stream_url_2embed },
            { name: 'Servidor Directo', url: ep.stream_url_superembed }
        ].filter(s => s.url && s.url.trim() !== '');

        if (servers.length > 1) {
            this.showServerSelector(servers, seekSeconds);
        }

        this._playSource(servers[0].url, seekSeconds);
    },

    async _playSource(url, seekSeconds = 0) {
        const video = document.getElementById('videoPlayer');
        const iframe = document.getElementById('videoIframe');
        const container = document.getElementById('playerContainer');
        const loader = document.getElementById('playerLoader');

        // FASE 4: Notificar inicio de reproducción al Sync Loop (Solo Host)
        import('./watch-party-ui.js').then(m => m.startHostSyncLoop());

        this._playSourceInElement(url, seekSeconds, 'videoPlayer', 'videoIframe');
    },

    /**
     * Versión genérica de _playSource para inyectar en cualquier elemento
     */
    _playSourceInElement(url, seekSeconds, videoId, iframeId) {
        const video = document.getElementById(videoId);
        const iframe = document.getElementById(iframeId);
        // Intentar encontrar el contenedor principal o el de Live para feedback visual
        const container = document.getElementById('playerContainer') || document.getElementById('livePlayerContainer');
        const loader = document.getElementById('playerLoader') || document.getElementById('livePlaceholder');

        if (!video || !iframe) return;

        // Reset listeners previos y estado HLS
        video.onended = null;
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }

        container.classList.remove('hidden');
        if (container.id === 'playerContainer') {
            const helpBtn = document.getElementById('watchPartyHelpBtn');
            if (helpBtn) helpBtn.style.display = 'none';
        }
        if (loader) loader.classList.remove('hidden');

        // Determinar título para telemetría
        if (this.currentType === 'movie') {
            this.currentPlaybackTitle = this.movieData?.title || 'Película';
        }

        if (window.updateGlobalPlaybackStatus) {
            window.updateGlobalPlaybackStatus({ 
                title: this.currentPlaybackTitle, 
                type: this.currentType,
                season: this.currentSeason,
                episode: this.currentEpisode
            });
        }

        const smartUrl = this._getSmartUrl(url, seekSeconds);
        const isIframe = smartUrl.includes('youtube.com') ||
            smartUrl.includes('vimeo.com') ||
            smartUrl.includes('vimeus.com') ||
            smartUrl.includes('facebook.com') ||
            smartUrl.includes('ok.ru') ||
            smartUrl.includes('upstream') ||
            smartUrl.includes('mixdrop') ||
            smartUrl.includes('/e/') ||
            smartUrl.includes('embed');

        const isDirectStream = /\.(mp4|m3u8|webm|ogg|ts)([?#]|$)/i.test(smartUrl);

        // Limpiar errores previos
        const oldError = container.querySelector('.content-error-overlay');
        if (oldError) oldError.remove();

        if (isIframe && !isDirectStream) {
            video.classList.add('hidden');
            iframe.classList.remove('hidden');
            video.pause();

            if (smartUrl.includes('facebook.com')) {
                iframe.setAttribute('referrerpolicy', 'no-referrer');
            } else {
                iframe.removeAttribute('referrerpolicy');
            }

            // Forzar autoplay en iframes comunes si no lo tienen
            let finalUrl = smartUrl;
            if (!finalUrl.includes('autoplay=')) {
                finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'autoplay=1&muted=1';
            }

            iframe.src = finalUrl;
            this.currentIsIframe = true;
            this._startIframeTracking(seekSeconds, iframe);
            
            // Limpiar timers previos si existen
            if (this.iframeErrorTimer) clearTimeout(this.iframeErrorTimer);

            if (loader) {
                // Aumentado a 15 segundos para dar margen a servidores lentos (vidsrc, streamtape, etc)
                // y evitar el "falso error" que reporta el usuario.
                this.iframeErrorTimer = setTimeout(() => {
                    if (this.currentIsIframe && !iframe.src.includes('about:blank')) {
                        console.warn('[VivoTV] El contenido tarda demasiado o falló. Intentando servidor alternativo.');
                        this._tryNextServer(seekSeconds).then(success => {
                            if (!success) this.showContentError(container, this.currentType);
                        });
                    }
                }, 15000); 
            }

            if (loader) {
                // Ocultar loader tras un tiempo razonable para permitir ver el reproductor del iframe
                setTimeout(() => {
                    if (loader) loader.classList.add('hidden');
                }, 4000);
            }
        } else {
            iframe.classList.add('hidden');
            video.classList.remove('hidden');
            iframe.src = '';
            this.currentIsIframe = false;

            // Manejo de Errores en Video Directo
            video.onerror = () => {
                this._tryNextServer(video.currentTime || seekSeconds).then(success => {
                    if (!success) this.showContentError(container, this.currentType);
                });
            };
            
            // Forzar inicio automático silenciado (Muted Autoplay)
            video.muted = true;

            // Listener para fin de video (Solo streams directos y si es TV)
            if (isDirectStream && this.currentType === 'tv') {
                video.onended = () => {
                    this._getNextEpisode().then(nextEp => {
                        if (nextEp) this._showMarathonCountdown(nextEp, _supabase);
                    });
                };
            }

            // PROBLEMA 3 FIX: el `loadedmetadata` es el lugar correcto para el seek inicial.
            // El setTimeout en _startVideoTracking también intentaba hacer seek, creando
            // una race condition. Ahora `loadedmetadata` aplica el seek y le avisa a
            // _startVideoTracking que NO debe volver a saltar.
            if (smartUrl.toLowerCase().includes('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
                this.hls = new Hls({
                    enableSoftwareAES: true,
                    autoStartLoad: true,
                    ignoreDeviceStreamErrors: true,
                    maxMaxBufferLength: 30
                });
                this.hls.attachMedia(video);
                this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    if (seekSeconds > 0) {
                        video.currentTime = seekSeconds;
                        console.log(`[Player] HLS Seek aplicado: ${seekSeconds}s`);
                    }
                    video.play().catch(e => console.warn('[Player] Autoplay bloqueado:', e));
                    if (loader) loader.classList.add('hidden');
                    this._startVideoTracking(video, seekSeconds, true); // seekAlreadyApplied=true
                });
                this.hls.loadSource(smartUrl);
            } else if (smartUrl.toLowerCase().includes('.m3u8') && video.canPlayType('application/vnd.apple.mpegurl')) {
                // Safari nativo sin HLS.js
                video.src = smartUrl;
                video.addEventListener('loadedmetadata', () => {
                    if (seekSeconds > 0) video.currentTime = seekSeconds;
                    video.play().catch(e => console.warn('[Player] Autoplay bloqueado:', e));
                    if (loader) loader.classList.add('hidden');
                    this._startVideoTracking(video, seekSeconds, true); // seekAlreadyApplied=true
                }, { once: true });
            } else {
                // ── HTTPS STREAMS (y MP4/WebM sin extensión) ──────────────────────────
                // Las URLs tipo https://server.com/video/abc (sin extensión) entran aquí.
                // El seek funciona SOLO si el servidor soporta HTTP Range Requests
                // (header: Accept-Ranges: bytes). Si no lo soporta, video.currentTime
                // vuelve a 0 silenciosamente. Usamos verificación de seekable + retry.
                video.src = smartUrl;

                video.addEventListener('loadedmetadata', () => {
                    // TV BOX FIX: En Video Beam/TV Box el autoplay puede bloquearse
                    // aunque el video esté en mute. Forzamos play() con manejo visual.
                    const playPromise = video.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(e => {
                            console.warn("[Player] Autoplay bloqueado en TV Box, mostrando play hint:", e);
                            if (loader) loader.innerHTML = '<div class="play-hint" onclick="document.getElementById(\'videoPlayer\').play();this.remove();" style="cursor:pointer;display:flex;align-items:center;gap:12px;font-size:22px;">▶ Toca para reproducir</div>';
                        });
                    }

                    if (seekSeconds > 0) {
                        // Intentar seek inmediato
                        video.currentTime = seekSeconds;

                        // Verificar después de 800ms si el seek fue efectivo
                        setTimeout(() => {
                            const actual = Math.floor(video.currentTime);
                            const expected = seekSeconds;
                            const seekWorked = Math.abs(actual - expected) < 5;

                            if (seekWorked) {
                                console.log(`[Player] ✅ Seek HTTPS exitoso: ${actual}s`);
                                showToast("Reanudando desde donde te quedaste...", "info");
                            } else {
                                // El servidor no soporta Range Requests — seek no funciona
                                console.warn(`[Player] ⚠️ Servidor no soporta seek (actual=${actual}s, expected=${expected}s)`);
                                video.currentTime = seekSeconds;
                                setTimeout(() => {
                                    const actual2 = Math.floor(video.currentTime);
                                    if (Math.abs(actual2 - expected) < 5) {
                                        showToast("Reanudando desde donde te quedaste...", "info");
                                    } else {
                                        showToast(`▶ Reproduciendo desde el inicio (el servidor no permite reanudar)`, "warning");
                                        console.warn('[Player] ❌ Seek no disponible en este servidor de streaming.');
                                    }
                                }, 1500);
                            }
                        }, 800);
                    }
                }, { once: true });

                // TV BOX SAFE MODE WEB: Si el video se estanca por > 6 segundos
                // (stalled/waiting), intentar el siguiente servidor automáticamente.
                // Causa principal de pantalla negra en TV Box: codec no soportado
                // o buffer insuficiente con el decodificador de hardware.
                let _stallTimer = null;
                const _onStall = () => {
                    if (_stallTimer) clearTimeout(_stallTimer);
                    _stallTimer = setTimeout(() => {
                        if (video.readyState < 3 && !video.ended) {
                            console.warn('[Player] 📺 TV Box: Stream estancado > 6s. Intentando servidor alternativo...');
                            this._tryNextServer(video.currentTime || seekSeconds).then(success => {
                                if (!success) {
                                    // Si no hay más servidores, recargamos el mismo con parámetros limpios
                                    console.warn('[Player] Sin más servidores, recargando stream...');
                                    video.load();
                                    video.play().catch(() => {});
                                }
                            });
                        }
                    }, 6000);
                };
                video.addEventListener('stalled', _onStall);
                video.addEventListener('waiting', _onStall);
                video.addEventListener('playing', () => { if (_stallTimer) clearTimeout(_stallTimer); });

                if (loader) setTimeout(() => loader.classList.add('hidden'), 2000);
                this._startVideoTracking(video, seekSeconds, true);
            }
        }
    },

    _getSmartUrl(url, seekSeconds = 0) {
        if (!url) return '';
        let cleanUrl = url.trim();

        // 1. YouTube (Ocultando controles para modo TV)
        if (cleanUrl.includes('youtube.com/watch?v=') || cleanUrl.includes('youtube.com/v/')) {
            const id = cleanUrl.split(/v\/|v=/)[1].split(/[?&]/)[0];
            return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&disablekb=1&rel=0${seekSeconds > 0 ? '&start=' + seekSeconds : ''}`;
        }
        if (cleanUrl.includes('youtu.be/')) {
            const id = cleanUrl.split('youtu.be/')[1].split(/[?&]/)[0];
            return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&disablekb=1&rel=0${seekSeconds > 0 ? '&start=' + seekSeconds : ''}`;
        }
        // 2. Vimeo (Detección Ultra-Robusta con Regex)
        const vimeoRegex = /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/;
        const vimeoMatch = cleanUrl.match(vimeoRegex);
        
        if (vimeoMatch) {
            const id = vimeoMatch[1];
            const roundedSeek = Math.floor(seekSeconds);
            // Prioridad: Query parameters (?t=) son más confiables para el primer inicio que el hash (#t)
            return `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&playsinline=1&title=0&byline=0&portrait=0${roundedSeek > 0 ? '&t=' + roundedSeek + 's' : ''}`;
        }

        // 3. Facebook
        if (cleanUrl.includes('facebook.com/') && !cleanUrl.includes('plugins/video.php')) {
            return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(cleanUrl)}&autoplay=true&mute=true&show_text=0&width=1280${seekSeconds > 0 ? '&t=' + seekSeconds : ''}`;
        }
        
        // 4. Inyectar Autoplay Global en reproductores genéricos
        if (!cleanUrl.includes('autoplay=') && !cleanUrl.includes('auto=') && !cleanUrl.includes('autostart=')) {
            const sep = cleanUrl.includes('?') ? '&' : '?';
            cleanUrl += `${sep}autoplay=1&muted=1&mute=1&auto=1`;
        }
        
        // 5. Intentar inyectar tiempo en reproductores genéricos
        if (seekSeconds > 0 && !cleanUrl.includes('?t=') && !cleanUrl.includes('&t=') && !cleanUrl.includes('#t=') && !cleanUrl.includes('start=')) {
            const roundedSeek = Math.floor(seekSeconds);
            // Intentamos query param primero, si no, hash como fallback HTML5
            const sepTime = cleanUrl.includes('?') ? '&' : '?';
            cleanUrl += `${sepTime}t=${roundedSeek}`;
        }
        
        return cleanUrl;
    },

    _startVideoTracking(video, seek, seekAlreadyApplied = false) {
        let hasJumped = seek <= 0 || seekAlreadyApplied;
        let lastSavedTime = -1;

        // --- SALTO INTELIGENTE (Auto-Resume) ---
        // PROBLEMA 3 FIX: Solo volvemos a saltar si `loadedmetadata` NO lo hizo ya.
        // Esto evita la race condition entre el handler del evento y el setTimeout.
        if (seek > 0 && !seekAlreadyApplied) {
            const delay = 1500; 
            console.log(`[VivoTV] Programando seek de seguridad (${seek}s) en ${delay/1000}s...`);
            setTimeout(() => {
                if (video && !hasJumped && (video.readyState >= 1 || !video.paused)) {
                    video.currentTime = seek;
                    hasJumped = true;
                    showToast("Reanudando desde donde te quedaste...", "info");
                }
            }, delay);
        } else if (seek > 0 && seekAlreadyApplied) {
            hasJumped = true;
            showToast("Reanudando desde donde te quedaste...", "info");
        }

        // --- SISTEMA DE TELEMETRÍA GLOBAL (Para Watch Party) ---
        window.PLAYER_GLOBAL_STATE = { currentTime: 0, isPlaying: false };
        const updateTelemetry = () => {
            if (!video.paused && !video.ended) {
                window.PLAYER_GLOBAL_STATE.currentTime = video.currentTime;
                window.PLAYER_GLOBAL_STATE.isPlaying = true;
                this._checkBingeWatch(video.currentTime, video.duration);
            } else {
                window.PLAYER_GLOBAL_STATE.isPlaying = false;
            }
        };
        video.addEventListener('timeupdate', updateTelemetry);
        video.addEventListener('pause', updateTelemetry);
        video.addEventListener('play', updateTelemetry);

        // --- WATCH PARTY FAST SYNC (Eventos Inmediatos) ---
        const fireForceSync = () => window.dispatchEvent(new CustomEvent('vivotv:force_party_sync'));
        video.addEventListener('seeked', fireForceSync);
        video.addEventListener('play', fireForceSync);
        video.addEventListener('pause', fireForceSync);

        this._createSmartControls();
        video.play().catch(() => {});
        
        // --- PULSO INICIAL (Fase 6) ---
        this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, Math.floor(seek), _supabase);
        
        this._stopProgressTimer();

        // DEBOUNCED SAVE (Telemetría eficiente - Alta Precisión: 15s)
        const doSave = () => {
            if (video && hasJumped) {
                const cur = Math.floor(video.currentTime);
                if (cur !== lastSavedTime && cur > 0) {
                    this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, cur, _supabase);
                    lastSavedTime = cur;

                    // Actualizar Telemetría en Vivo vía app.js
                    if (window.updateGlobalPlaybackStatus) {
                        window.updateGlobalPlaybackStatus({
                            title: this.currentPlaybackTitle,
                            type: this.currentType,
                            season: this.currentSeason,
                            episode: this.currentEpisode,
                            seconds: cur,
                            formattedTime: this.formatTime(cur)
                        });
                    }
                }
            }
        };

        // Backup de salvado cada 15s (Alta Precisión solicitada por usuario)
        this.progressTimer = setInterval(() => { if (!video.paused) doSave(); }, 15000);

        // Visibility & Unload Tracking (Asegura guardar telemetría si cierran ventana o minimizan)
        this._currentVisHandler = () => { if (document.hidden) doSave(); };
        this._currentBeforeUnloadHandler = () => { doSave(); };
        document.addEventListener('visibilitychange', this._currentVisHandler);
        window.addEventListener('beforeunload', this._currentBeforeUnloadHandler);

        // Guardado al pausar (Event Driven)
        // Guardado al terminar + Siguiente Episodio
        // --- EVENTOS WATCH PARTY (Sincronización Instantánea) ---
        const forceSync = () => window.dispatchEvent(new CustomEvent('vivotv:force_party_sync'));
        video.onplay = () => { forceSync(); };
        video.onpause = () => { doSave(); forceSync(); };
        video.onseeked = () => { forceSync(); };

        video.onended = () => {
            doSave();
            this._stopProgressTimer();

            if (this.currentType === 'tv') {
                // BUG FIX: _getNextEpisode es async — se necesita .then()
                // Antes se llamaba sin await, recibiendo una Promise en vez del episodio.
                this._getNextEpisode().then(nextEp => {
                    if (nextEp) this._showMarathonCountdown(nextEp, _supabase);
                });
            }
        };

        video.ontimeupdate = () => {
            const cur = Math.floor(video.currentTime);
            const total = Math.floor(video.duration);

            // Detección de "Siguiente Episodio" (2 minutos antes de terminar)
            if (this.currentType === 'tv' && total > 300) {
                const remaining = total - cur;
                if (remaining <= 120 && remaining > 5) {
                    this._showNextEpisodeButton();
                } else if (remaining <= 5 || remaining > 125) {
                    this._hideNextEpisodeButton();
                }
            }

            // PROBLEMA 4 FIX: Detección de Intro SOLO en los primeros 60 segundos reales.
            // El umbral anterior era 180s (3 minutos) — si el usuario reanudaba en el
            // minuto 1:30, el botón aparecía igual aunque ya hubiera pasado la intro.
            // Ahora usamos 60s como límite superior de la zona de intro, lo cual es
            // más conservador y evita el falso positivo en resumes.
            const skipBtn = document.getElementById('btnSkipIntro');
            const isInIntroZone = cur > 10 && cur < 60;

            if (isInIntroZone) {
                if (skipBtn && !skipBtn.classList.contains('active')) {
                    skipBtn.classList.add('active');
                    // AUTO-SKIP: Solo salta si el usuario sigue en la zona de intro 8s después
                    // (no saltar si ya superó los 60s por seek/resume entre tanto)
                    setTimeout(() => {
                        const curNow = Math.floor(video.currentTime);
                        if (skipBtn.classList.contains('active') && curNow < 60) {
                            skipBtn.click();
                            showToast("Intro saltada automáticamente", "info");
                        }
                    }, 8000);
                }
            } else {
                skipBtn?.classList.remove('active');
            }
        };
    },

    _startIframeTracking(seekSeconds = 0, targetIframe = null) {
        this._stopProgressTimer();
        
        // Intentar usar el parámetro, de lo contrario buscar el de cine o el de TV
        const iframe = targetIframe || document.getElementById('videoIframe') || document.getElementById('liveVideoIframe');
        
        if (!iframe) {
            console.warn('[Player] Tracking abortado: No se encontró un iframe activo.');
            return;
        }

        const url = iframe.src;
        let elapsed = seekSeconds;
        let lastSavedElapsed = -1;

        const doSaveProgress = (currentSecs) => {
            if (currentSecs > 0 && Math.abs(currentSecs - lastSavedElapsed) >= 10) {
                this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, Math.floor(currentSecs), _supabase);
                lastSavedElapsed = currentSecs;

                if (window.updateGlobalPlaybackStatus) {
                    window.updateGlobalPlaybackStatus({
                        title: this.currentPlaybackTitle,
                        type: this.currentType,
                        season: this.currentSeason,
                        episode: this.currentEpisode,
                        seconds: Math.floor(currentSecs),
                        formattedTime: this.formatTime(currentSecs)
                    });
                }
            }
        };

        // --- OPCIÓN A: YOUTUBE SDK ---
        if (url.includes('youtube.com')) {
            const initYT = () => {
                this.ytPlayer = new YT.Player('videoIframe', {
                    events: {
                        'onStateChange': (event) => {
                            if (event.data === YT.PlayerState.PAUSED) {
                                doSaveProgress(this.ytPlayer.getCurrentTime());
                            }
                        }
                    }
                });
                this.progressTimer = setInterval(() => {
            if (this.ytPlayer && this.ytPlayer.getPlayerState) {
                if (this.ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                    elapsed = this.ytPlayer.getCurrentTime();
                    doSaveProgress(elapsed);
                    
                    const duration = this.ytPlayer.getDuration();
                    this._checkBingeWatch(elapsed, duration);
                }
            }
        }, 10000);
            };
            if (typeof YT !== 'undefined' && YT.Player) initYT();
            else window.onYouTubeIframeAPIReady = initYT;
        } 
        // --- OPCIÓN B: VIMEO SDK ---
        else if (url.includes('vimeo.com')) {
            this.vimeoPlayer = new Vimeo.Player(iframe);
            this.vimeoPlayer.on('pause', (data) => doSaveProgress(data.seconds));
            this.progressTimer = setInterval(() => {
                this.vimeoPlayer.getCurrentTime().then(secs => {
                    elapsed = secs;
                    doSaveProgress(elapsed);
                    
                    this.vimeoPlayer.getDuration().then(duration => {
                        this._checkBingeWatch(elapsed, duration);
                    });
                });
            }, 10000);
        }
        // --- OPCIÓN C: CRONÓMETRO INTELIGENTE (iframes sin SDK) ---
        // BUG FIX: El timer anterior siempre contaba aunque el video estuviera pausado.
        // No hay API para leer el estado de un iframe cross-origin, así que:
        // 1. Escuchamos postMessage de pause/play que envíen algunos players.
        // 2. Usamos un estimador: si _isPausedEst=true, no sumamos tiempo.
        else {
            this._isPausedEst = false;

            // Escuchar pause/play via postMessage (soportado por JWPlayer, Plyr, Flowplayer, etc.)
            this._iframePauseHandler = (event) => {
                const d = event.data;
                if (!d) return;
                const raw = typeof d === 'string' ? d : JSON.stringify(d);
                if (/pause|stop|"paused":true/i.test(raw))  this._isPausedEst = true;
                if (/play|resume|"paused":false/i.test(raw)) this._isPausedEst = false;
            };
            window.addEventListener('message', this._iframePauseHandler);

            this.progressTimer = setInterval(() => {
                const isPlayerActive = document.getElementById('playerModal')?.classList.contains('active');
                const isVisible = document.visibilityState === 'visible';
                // No contar si el iframe envió señal de pausa o la pestaña no es visible
                if (!isPlayerActive || !isVisible || this._isPausedEst) return;
                elapsed += 10;
                doSaveProgress(elapsed);
            }, 10000);
        }

        this._currentVisHandler = () => {
            if (document.hidden) {
                doSaveProgress(elapsed);
                // Si va a segundo plano, pausar el estimador del iframe
                if (this._isPausedEst !== undefined) this._isPausedEst = true;
            } else {
                if (this._isPausedEst !== undefined) this._isPausedEst = false;
            }
        };
        this._currentBeforeUnloadHandler = () => { doSaveProgress(elapsed); };
        document.addEventListener('visibilitychange', this._currentVisHandler);
        window.addEventListener('beforeunload', this._currentBeforeUnloadHandler);
    },

    /**
     * Lógica de Auto-Play: Detecta el final del episodio (95%)
     */
    _checkBingeWatch(currentTime, totalTime) {
        if (this.currentType !== 'tv' || !totalTime || totalTime < 60) return;
        
        // Evita disparar el prompt múltiples veces
        if (this._bingePromptShown) return;

        const progressPercent = currentTime / totalTime;
        if (progressPercent >= 0.95) {
            this._bingePromptShown = true;
            console.log(`[VivoTV🎬] ¡Binge-Watch Detectado! ${Math.floor(progressPercent*100)}% Completado.`);
            window.dispatchEvent(new CustomEvent('vivotv:binge_prompt', {
                detail: {
                    tmdbId: this.currentTmdbId,
                    season: this.currentSeason,
                    episode: this.currentEpisode
                }
            }));
        }
    },

    /**
     * Devuelve el estado actual de reproducción para Watch Party
     */
    getCurrentPlaybackState() {
        // Native
        const video = document.getElementById('videoPlayer');
        if (video && !video.classList.contains('hidden')) {
            return { currentTime: video.currentTime, isPlaying: !video.paused };
        }
        
        // YouTube
        if (this.ytPlayer && this.ytPlayer.getPlayerState) {
            const state = this.ytPlayer.getPlayerState();
            return { 
                currentTime: this.ytPlayer.getCurrentTime() || 0, 
                isPlaying: state === 1 // 1 = PLAYING
            };
        }
        
        // Vimeo
        if (this.vimeoPlayer) {
            // Guardamos localmente el progreso porque Vimeo es asíncrono
            return { 
                currentTime: window.PLAYER_GLOBAL_STATE?.currentTime || 0, 
                isPlaying: window.PLAYER_GLOBAL_STATE?.isPlaying || false 
            };
        }

        return null;
    },

    /**
     * Aplica el estado remoto (Guest) del Watch Party
     */
    syncPlaybackState(payload) {
        const { currentTime, isPlaying } = payload;
        
        // Native
        const video = document.getElementById('videoPlayer');
        if (video && !video.classList.contains('hidden')) {
            const diff = Math.abs(video.currentTime - currentTime);
            if (diff > 3) video.currentTime = currentTime;
            if (isPlaying && video.paused) video.play().catch(() => {});
            else if (!isPlaying && !video.paused) video.pause();
            return;
        }

        // YouTube
        if (this.ytPlayer && this.ytPlayer.seekTo) {
            const ytTime = this.ytPlayer.getCurrentTime() || 0;
            if (Math.abs(ytTime - currentTime) > 3) this.ytPlayer.seekTo(currentTime, true);
            const state = this.ytPlayer.getPlayerState();
            if (isPlaying && state !== 1) this.ytPlayer.playVideo();
            else if (!isPlaying && state === 1) this.ytPlayer.pauseVideo();
            return;
        }

        // Vimeo
        if (this.vimeoPlayer) {
            this.vimeoPlayer.getCurrentTime().then(vTime => {
                if (Math.abs(vTime - currentTime) > 3) this.vimeoPlayer.setCurrentTime(currentTime);
                if (isPlaying) this.vimeoPlayer.play().catch(() => {});
                else this.vimeoPlayer.pause();
            });
        }
    },

    _stopProgressTimer() {
        if (this.progressTimer) clearInterval(this.progressTimer);
        this.progressTimer = null;
        this._bingePromptShown = false;

        // Limpiar listener de pausa de iframes (Option C)
        if (this._iframePauseHandler) {
            window.removeEventListener('message', this._iframePauseHandler);
            this._iframePauseHandler = null;
            this._isPausedEst = false;
        }

        // Limpiar Telemetría al detener
        if (window.updateGlobalPlaybackStatus) {
            window.updateGlobalPlaybackStatus(null);
        }

        if (this._currentVisHandler) {
            document.removeEventListener('visibilitychange', this._currentVisHandler);
            this._currentVisHandler = null;
        }
        if (this._currentBeforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._currentBeforeUnloadHandler);
            this._currentBeforeUnloadHandler = null;
        }
    },

    async _saveProgress(tmdbId, type, season, episode, seconds, supabaseClient) {
        if (!supabaseClient || !this.currentUserId) return;
        
        const profile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
        if (!profile) return;

        const finalTmdbId = Number(tmdbId);
        if (isNaN(finalTmdbId)) return;
        if (seconds < 0) return;

        // ── FIX: Cálculo del estado "VISTO" ──
        // Obtener la duración del video actual para calcular el porcentaje.
        // Para streams directos la obtenemos del elemento <video>.
        // Para iframes la estimamos con un límite de tiempo conocido (si existe).
        let isWatched = false;
        const video = document.getElementById('videoPlayer');
        let totalDuration = video && !video.classList.contains('hidden') && video.duration > 0
            ? video.duration
            : (this._estimatedDuration || 0);

        if (totalDuration > 60) {
            const pct = seconds / totalDuration;
            // Marcar como visto al 90% — igual que Flutter y la lógica de la Web
            isWatched = pct >= 0.9;
        } else {
            // Sin duración confiable: marcar como visto si lleva > 80 min en películas
            // o > 18 min en series (un episodio estándar de 20 min)
            const threshold = (type === 'movie') ? 4800 : 1080;
            isWatched = seconds >= threshold;
        }

        console.log(`[Player] Guardando progreso: ${finalTmdbId} -> ${seconds}s | visto: ${isWatched}`);

        const { error } = await supabaseClient.from('watch_history').upsert({
            user_id: this.currentUserId,
            profile_id: profile.id,
            tmdb_id: finalTmdbId,
            type: type || 'movie',
            season_number: Number(season) || 0,
            episode_number: Number(episode) || 0,
            progress_seconds: Math.floor(seconds),
            is_watched: isWatched,
            last_watched: new Date().toISOString()
        }, { 
            onConflict: 'profile_id,tmdb_id,season_number,episode_number' 
        });

        if (error) {
            console.error('[Player] Error al guardar progreso:', error);
        }

        // Si quedó marcado como visto, actualizar el badge en la UI sin recargar
        if (isWatched) {
            const badges = document.querySelectorAll(`[data-tmdb="${finalTmdbId}"] .watched-badge, [data-id="${finalTmdbId}"] .watched-badge`);
            badges.forEach(b => b.classList.remove('hidden'));

            // Track logro de contenido completado
            if (window.ACHIEVEMENTS) {
                window.ACHIEVEMENTS.track('complete_content', { type, tmdb_id: finalTmdbId });
            }
        }
    },

    async _getProgress(tmdbId, type, season, episode, supabaseClient) {
        if (!supabaseClient || !this.currentUserId) return null;
        const profile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
        if (!profile) return null;

        const finalTmdbId = Number(tmdbId);

        let query = supabaseClient.from('watch_history')
            .select('progress_seconds')
            .eq('profile_id', profile.id)
            .eq('tmdb_id', finalTmdbId)
            .eq('season_number', Number(season) || 0)
            .eq('episode_number', Number(episode) || 0);
        
        const { data, error } = await query.maybeSingle();
        if (error) console.error('[Player] Error al obtener progreso:', error);
        return data;
    },

    async detectGlobalSeriesProgress(tmdbId, supabaseClient) {
        if (!this.currentUserId) return;
        const profile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
        if (!profile) return;

        const { data } = await supabaseClient.from('watch_history')
            .select('season_number, episode_number, progress_seconds')
            .eq('user_id', this.currentUserId)
            .eq('profile_id', profile.id)
            .eq('tmdb_id', String(tmdbId))
            .eq('type', 'tv')
            .order('last_watched', { ascending: false })
            .limit(1)
            .maybeSingle();
        this.lastSeriesProgress = data;
    },

    async resumeLastEpisode(seasonNum, epNum, seekSecs, supabaseClient) {
        // En lugar de navegar el DOM, pedimos el stream_url directo para reproducir de inmediato
        const { data: epData } = await supabaseClient.from('series_episodes')
            .select('stream_url')
            .eq('tmdb_id', String(this.currentTmdbId))
            .eq('season_number', seasonNum)
            .eq('episode_number', epNum)
            .maybeSingle();

        if (epData) {
            this.currentSeason = seasonNum;
            this.currentEpisode = epNum;
            this._playEpisode(this.currentTmdbId, seasonNum, epData, supabaseClient, seekSecs);
            // También movemos la pestaña de temporada en el modal para UI coherente
            const pills = document.getElementById('seasonsPills');
            const pill = Array.from(pills.querySelectorAll('.season-pill')).find(p => p.textContent.includes(`Temporada ${seasonNum}`));
            if (pill) {
                pills.querySelectorAll('.season-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            }
        }
    },

    async checkIfFavorite(supabase) {
        const btn = document.getElementById('btnAddToMyList');
        const { data: { user } } = await supabase.auth.getUser();
        const profile = JSON.parse(sessionStorage.getItem('vivotv_current_profile'));
        if (!user || !btn || !profile) return;

        this.currentUserId = user.id;
        const { data } = await supabase.from('user_favorites')
            .select('id')
            .eq('user_id', user.id)
            .eq('profile_id', profile.id) // Fase 3
            .eq('tmdb_id', Number(this.currentTmdbId))
            .maybeSingle();
        
        btn.classList.toggle('added-to-list', !!data);
        const text = document.getElementById('favBtnText');
        if (text) text.textContent = !!data ? 'En Mi Lista' : 'Mi Lista';
    },

    async toggleFavorite(supabase, tmdbId = null, type = null, btnElement = null) {
        const finalId = tmdbId || this.currentTmdbId;
        const finalType = type || this.currentType;
        const profile = JSON.parse(sessionStorage.getItem('vivotv_current_profile'));
        if (!profile || !finalId) return;

        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) return;

        // Determinar si ya está en la lista (prioriza el elemento visual pasado)
        const btn = btnElement || document.getElementById('btnAddToMyList');
        const isAdded = btn?.classList.contains('added-to-list') || btn?.textContent === '✓';

        try {
            if (isAdded) {
                await supabase.from('user_favorites').delete()
                    .eq('profile_id', profile.id)
                    .eq('tmdb_id', Number(finalId));
            } else {
                await supabase.from('user_favorites').insert({ 
                    user_id: userId, 
                    profile_id: profile.id, 
                    tmdb_id: Number(finalId),
                    type: finalType
                });
            }

            // Actualizar UI del botón
            if (btnElement) {
                const isNowAdded = !isAdded;
                btnElement.classList.toggle('added-to-list', isNowAdded);
                btnElement.textContent = isNowAdded ? '✓' : '+';
                btnElement.title = isNowAdded ? 'Eliminar de Mi Lista' : 'Añadir a Mi Lista';
            } else {
                this.checkIfFavorite(supabase);
            }

            // Actualizar caché global de favoritos para coherencia visual
            if (window.VIVOTV_FAVORITES) {
                const idStr = finalId.toString();
                if (isAdded) window.VIVOTV_FAVORITES.delete(idStr);
                else window.VIVOTV_FAVORITES.add(idStr);
            }

            if (window.showToast) window.showToast(isAdded ? 'Eliminado de Mi Lista' : 'Añadido a Mi Lista');
            
            // Si estamos en la sección de "Mi Lista", recargarla
            if (document.getElementById('favoritesGrid') && !document.getElementById('favoritesGrid').classList.contains('hidden')) {
                // Pequeño delay para que la DB se actualice
                setTimeout(() => window.dispatchEvent(new CustomEvent('refresh-my-list')), 500);
            }
        } catch (e) {
            console.error('[Favorites] Error:', e);
        }
    },

    showFloatingResumeCard({ thumb, title, desc, onResume }) {
        document.querySelector('.glass-floating-card')?.remove();
        const card = document.createElement('div');
        card.className = 'glass-floating-card';
        card.innerHTML = `
            <div class="floating-card-blur"></div>
            <img src="${thumb}" class="floating-card-thumb" alt="Preview">
            <div class="floating-card-content">
                <div class="floating-card-header">
                    <span class="floating-badge">CATÁLOGO</span>
                    <h3>${title}</h3>
                </div>
                <p>${desc}</p>
                <div class="floating-card-actions">
                    <button class="float-btn float-btn-primary" id="btnFloatResume">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        ${title.includes('Siguiente') ? 'Siguiente' : 'Reproducir'}
                    </button>
                    <button class="float-btn float-btn-close" id="btnFloatClose">&times;</button>
                </div>
            </div>
        `;
        document.body.appendChild(card);
        
        document.getElementById('btnFloatResume').onclick = () => { card.remove(); onResume(); };
        document.getElementById('btnFloatClose').onclick = () => { card.remove(); };
        
        // Auto-remove after 30s
        setTimeout(() => card?.remove(), 30000);
    },

    _showNextEpisodeButton() {
        if (document.querySelector('.next-episode-overlay')) return;
        const container = document.getElementById('playerContainer');
        const nextOverlay = document.createElement('div');
        nextOverlay.className = 'next-episode-overlay';
        nextOverlay.innerHTML = `
            <div class="modal-actions-wrapper">
                <button class="btn btn-play" id="btnModalPlay">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Reproducir ahora
                </button>
                <button class="btn btn-secondary" id="btnWatchParty">
                    <span>🎉</span> Watch Party
                </button>
                <button class="btn btn-circle" id="btnFavModal">
                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                </button>
            </div>
            <button class="next-btn-premium" id="btnSkipToNext">
                <span>Siguiente Episodio</span>
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
        `;
        container.appendChild(nextOverlay);
        
        document.getElementById('btnSkipToNext').onclick = () => {
            this._hideNextEpisodeButton();
            this.playNextEpisode();
        };
    },

    _hideNextEpisodeButton() {
        document.querySelector('.next-episode-overlay')?.remove();
    },

    async playNextEpisode() {
        await this.playNextEpisodeFrom(this.currentSeason, this.currentEpisode, _supabase);
    },

    async playNextEpisodeFrom(seasonNum, epNum, supabase) {
        // Buscar el siguiente episodio en la base de datos
        const { data: nextData } = await supabase.from('series_episodes')
            .select('season_number, episode_number, stream_url')
            .eq('tmdb_id', Number(this.currentTmdbId))
            .or(`and(season_number.eq.${seasonNum},episode_number.gt.${epNum}),season_number.gt.${seasonNum}`)
            .order('season_number', { ascending: true })
            .order('episode_number', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (nextData && nextData.stream_url) {
            this.currentSeason = nextData.season_number;
            this.currentEpisode = nextData.episode_number;
            this._playEpisode(this.currentTmdbId, nextData.season_number, nextData, supabase, 0);
            
            // Actualizar UI del modal en segundo plano si está abierto
            this.switchSeason(nextData.season_number, supabase);
        } else {
            showToast('Has llegado al final de los episodios disponibles.');
            this._hideNextEpisodeButton();
        }
    },

    formatTime(s) {
        if (!s) return '00:00';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sc = s % 60;
        return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}` : `${m}:${String(sc).padStart(2, '0')}`;
    },

    forceSaveCurrentProgress() {
        try {
            const video = document.getElementById('videoPlayer');
            if (video && !video.classList.contains('hidden')) {
                const cur = Math.floor(video.currentTime);
                if (cur > 0) {
                    this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, cur, _supabase);
                    console.log('[Player] Forzado salvado - Nativo:', cur);
                }
            }

            if (this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function') {
                const cur = Math.floor(this.ytPlayer.getCurrentTime());
                if (cur > 0) {
                    this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, cur, _supabase);
                    console.log('[Player] Forzado salvado - YouTube:', cur);
                }
            }

            if (this.vimeoPlayer && typeof this.vimeoPlayer.getCurrentTime === 'function') {
                this.vimeoPlayer.getCurrentTime().then(cur => {
                    const secs = Math.floor(cur);
                    if (secs > 0) {
                        this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, secs, _supabase);
                        console.log('[Player] Forzado salvado - Vimeo:', secs);
                    }
                });
            }
        } catch (e) {
            console.warn('[Player] Error al forzar salvado:', e);
        }
    },

    closeModal() {
        console.log('[Player] Cerrando modal, salvando progreso...');
        if (window.SOCIAL_PULSE) window.SOCIAL_PULSE.detach();
        this.forceSaveCurrentProgress();
        this._stopProgressTimer();
        this._stopTrailer();
        this._cancelMarathon();
        document.getElementById('detailModal').classList.add('hidden');
        document.getElementById('playerContainer').classList.add('hidden');
        document.getElementById('videoPlayer').pause();
        document.getElementById('videoIframe').src = '';
        document.documentElement.classList.remove('no-scroll');
        document.body.classList.remove('no-scroll');
    },

    _createSmartControls() {
        const container = document.getElementById('playerContainer');
        if (!container || document.getElementById('btnSkipIntro')) return;

        // Botón Saltar Intro
        const skipBtn = document.createElement('button');
        skipBtn.id = 'btnSkipIntro';
        skipBtn.className = 'skip-intro-btn';
        skipBtn.innerHTML = `<span>Saltar Intro</span> <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`;
        container.appendChild(skipBtn);

        // BUG FIX: Botón "Siguiente Episodio" que aparece 2 minutos antes de terminar
        // Este botón existía en la lógica de ontimeupdate pero NUNCA se creaba en el DOM.
        const nextEpBtn = document.createElement('button');
        nextEpBtn.id = 'btnNextEpisode';
        nextEpBtn.className = 'next-episode-btn';
        nextEpBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg> <span>Siguiente Episodio</span>`;
        nextEpBtn.style.cssText = `
            position: absolute; bottom: 70px; right: 20px;
            background: #fff; color: #000; border: none;
            padding: 10px 20px; border-radius: 6px;
            font-size: 14px; font-weight: 700;
            cursor: pointer; display: none; align-items: center;
            gap: 8px; z-index: 100; opacity: 0;
            transition: opacity 0.3s ease;
        `;
        container.appendChild(nextEpBtn);

        // Botón PiP
        const pipBtn = document.createElement('div');
        pipBtn.id = 'btnPiP';
        pipBtn.className = 'pip-btn';
        pipBtn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="#fff" title="Ventana flotante"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg>`;
        container.appendChild(pipBtn);

        pipBtn.onclick = () => this.togglePiP();
        skipBtn.onclick = () => {
            const video = document.getElementById('videoPlayer');
            if (video) video.currentTime += 85; // Salta aprox 1:25
            skipBtn.classList.remove('active');
            showToast("Intro saltada", "info");
        };
        nextEpBtn.onclick = () => {
            this._cancelMarathon();
            this.playNextEpisode();
        };
    },

    // BUG FIX: estos métodos eran llamados en ontimeupdate pero no estaban definidos
    // causando un crash silencioso de JS cada segundo durante la reproducción.
    _showNextEpisodeButton() {
        const btn = document.getElementById('btnNextEpisode');
        if (!btn || btn.style.opacity === '1') return;
        btn.style.display = 'flex';
        requestAnimationFrame(() => { btn.style.opacity = '1'; });
    },

    _hideNextEpisodeButton() {
        const btn = document.getElementById('btnNextEpisode');
        if (!btn) return;
        btn.style.opacity = '0';
        setTimeout(() => { btn.style.display = 'none'; }, 300);
    },

    async togglePiP() {
        const video = document.getElementById('videoPlayer');
        if (!video) return;
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await video.requestPictureInPicture();
            }
        } catch (e) {
            showToast("PiP no soportado en este navegador", "error");
        }
    },



    async _startAutoplayTrailer(id, type) {
        try {
            const data = await TMDB_SERVICE.getVideos(id, type);
            const trailer = (data.results || []).find(v => 
                (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube'
            );

            if (!trailer) return;

            const modalViewport = document.querySelector('.modal-viewport');
            if (!modalViewport) return;

            let container = document.createElement('div');
            container.className = 'auto-trailer-container';
            container.innerHTML = `
                <iframe src="https://www.youtube.com/embed/${trailer.key}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&loop=1&playlist=${trailer.key}" 
                        frameborder="0" allow="autoplay; encrypted-media"></iframe>
            `;

            modalViewport.prepend(container);
            
            // Forzar reflow y mostrar con fade
            setTimeout(() => {
                const backdrop = document.getElementById('modalBackdrop');
                if (backdrop) backdrop.classList.add('fade-out');
                container.classList.add('visible');
            }, 500);

        } catch (e) { console.error('Error auto trailer:', e); }
    },

    async _getNextEpisode() {
        if (!this.currentTmdbId || !this.currentSeason || !this.currentEpisode) return null;
        
        // Buscar el siguiente episodio en la base de datos (Fase Marathon PRO)
        const { data: nextData } = await _supabase.from('series_episodes')
            .select('season_number, episode_number, stream_url')
            .eq('tmdb_id', Number(this.currentTmdbId))
            .or(`and(season_number.eq.${this.currentSeason},episode_number.gt.${this.currentEpisode}),season_number.gt.${this.currentSeason}`)
            .order('season_number', { ascending: true })
            .order('episode_number', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (nextData && nextData.stream_url) {
            return {
                season: nextData.season_number,
                data: nextData
            };
        }
        return null;
    },

    _showMarathonCountdown(nextEp, supabaseClient) {
        this._cancelMarathon();
        const container = document.getElementById('playerContainer');
        let overlay = document.querySelector('.marathon-overlay');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'marathon-overlay';
            container.appendChild(overlay);
        }

        overlay.innerHTML = `
            <div class="marathon-countdown-w">
                <div class="marathon-circle-bg"></div>
                <div class="marathon-progress"></div>
                <div class="marathon-text" id="marathonSecs">10</div>
            </div>
            <div class="marathon-info">
                <p>SIGUIENTE EPISODIO</p>
                <h3>Temporada ${nextEp.season} • Episodio ${nextEp.data.episode_number}</h3>
            </div>
            <div class="marathon-actions">
                <button class="btn-marathon btn-marathon-next" id="btnMarathonNow">REPRODUCIR AHORA</button>
                <button class="btn-marathon btn-marathon-cancel" id="btnMarathonCancel">CANCELAR</button>
            </div>
        `;

        overlay.classList.add('visible');

        let timeLeft = 10;
        const textSecs = document.getElementById('marathonSecs');
        
        document.getElementById('btnMarathonNow').onclick = () => {
            this._cancelMarathon();
            this._playEpisode(this.currentTmdbId, nextEp.season, nextEp.data, supabaseClient);
        };
        
        document.getElementById('btnMarathonCancel').onclick = () => this._cancelMarathon();

        this.marathonTimer = setInterval(() => {
            timeLeft--;
            if (textSecs) textSecs.textContent = timeLeft;
            if (timeLeft <= 0) {
                this._cancelMarathon();
                this._playEpisode(this.currentTmdbId, nextEp.season, nextEp.data, supabaseClient);
            }
        }, 1000);
    },

    _cancelMarathon() {
        if (this.marathonTimer) clearInterval(this.marathonTimer);
        const overlay = document.querySelector('.marathon-overlay');
        if (overlay) overlay.classList.remove('visible');
    },
    
    showContentError(container, type = 'movie') {
        // Overlay de error desactivado por petición del usuario
        console.warn(`[Player] Error de carga para ${type}, pero el overlay está desactivado.`);
        
        // Mantener la lógica de limpieza crítica
        this._stopProgressTimer();
        const loader = document.getElementById('playerLoader');
        if (loader) loader.classList.add('hidden');
    },

    _hasNextServer() {
        return _currentServers && _currentServers.length > 1;
    },

    async _tryNextServer(seekSeconds = 0) {
        if (!this._hasNextServer()) return false;
        
        // Buscar el servidor actual y saltar al siguiente
        const currentUrl = document.getElementById('videoIframe').src || document.getElementById('videoPlayer').src;
        const currentIndex = _currentServers.findIndex(s => s.url === currentUrl);
        
        const nextIndex = (currentIndex + 1) % _currentServers.length;
        if (nextIndex === 0 && currentIndex !== -1) {
            console.warn('[Player] Se han probado todos los servidores.');
            return false;
        }

        const nextServer = _currentServers[nextIndex];
        showToast(`Reintentando con: ${nextServer.name}...`, 'warning');
        this._playSource(nextServer.url, seekSeconds);
        return true;
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') PLAYER_LOGIC.closeModal();
});
