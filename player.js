import { CONFIG } from './config.js';
import { TMDB_SERVICE } from './tmdb.js';
import { showToast } from './utils.js';
import { CATALOG_UI } from './ui.js'; // Solo se usa en funciones, pero evitamos import preventivo si es posible

let _supabase = null;
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
            
            // FASE 4: Evento de Watch Party
            const btnWP = document.getElementById('btnWatchParty');
            if (btnWP) {
                btnWP.onclick = async () => {
                    const { createPartyUI } = await import('./watch-party-ui.js');
                    createPartyUI(tmdbId, type);
                };
            }

            const btnExit = document.getElementById('btnExitPlayer');
            btnExit.onclick = () => {
                playerContainer.classList.add('hidden');
                videoPlayer.pause();
                videoIframe.src = '';
            };

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
        // En el esquema, tmdb_id es BigInt, lo pasamos como Number para compatibilidad
        const { data, error } = await supabaseClient.from('video_sources').select('stream_url').eq('tmdb_id', Number(tmdbId)).maybeSingle();
        if (error || !data?.stream_url) {
            showToast('Fuente no disponible.');
        } else {
            const progressObj = await this._getProgress(tmdbId, 'movie', 0, 0, supabaseClient);
            this._playSource(data.stream_url, progressObj?.progress_seconds || 0);
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
                    .select('episode_number, stream_url')
                    .eq('tmdb_id', Number(this.currentTmdbId))
                    .eq('season_number', Number(seasonNum))
            ]);

            const episodes = (seasonData.episodes || []).map(ep => {
                const dbEp = (dbEps.data || []).find(d => d.episode_number === ep.episode_number);
                return { ...ep, stream_url: dbEp?.stream_url };
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

        // Obtener progreso de esta temporada
        let progressMap = {};
        const { data: hist } = await supabaseClient.from('watch_history')
            .select('episode_number, progress_seconds')
            .eq('user_id', this.currentUserId)
            .eq('tmdb_id', String(this.currentTmdbId))
            .eq('season_number', seasonNum);
        
        (hist || []).forEach(h => progressMap[h.episode_number] = h);

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

        this._playSource(ep.stream_url, seekSeconds);
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
            smartUrl.includes('facebook.com') ||
            smartUrl.includes('ok.ru') ||
            smartUrl.includes('upstream') ||
            smartUrl.includes('mixdrop') ||
            smartUrl.includes('embed');

        const isDirectStream = /\.(mp4|m3u8|webm|ogg|ts)([?#]|$)/i.test(smartUrl);

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
            if (loader) setTimeout(() => loader.classList.add('hidden'), 2000);
        } else {
            iframe.classList.add('hidden');
            video.classList.remove('hidden');
            iframe.src = '';
            this.currentIsIframe = false;
            
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
                    video.play().catch(e => {
                        console.warn("[Player] Autoplay bloqueado, requiere clic inicial:", e);
                        if (loader) loader.innerHTML = '<div class="play-hint">▶ CARGANDO SEÑAL...</div>';
                    });

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
                                // Intentar una vez más por si el stream aún estaba buffering
                                video.currentTime = seekSeconds;
                                setTimeout(() => {
                                    const actual2 = Math.floor(video.currentTime);
                                    if (Math.abs(actual2 - expected) < 5) {
                                        showToast("Reanudando desde donde te quedaste...", "info");
                                    } else {
                                        // Informar al usuario sin romper la reproducción
                                        showToast(`▶ Reproduciendo desde el inicio (el servidor no permite reanudar)`, "warning");
                                        console.warn('[Player] ❌ Seek no disponible en este servidor de streaming.');
                                    }
                                }, 1500);
                            }
                        }, 800);
                    }
                }, { once: true });

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
        video.onpause = () => { doSave(); };

        // Guardado al terminar + Siguiente Episodio
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
        // --- OPCIÓN C: CRONÓMETRO INTELIGENTE (Goodstream y otros) ---
        else {
            this.progressTimer = setInterval(() => {
                // Solo avanzar si la pestaña es visible (Evita conteo falso)
                if (document.visibilityState === 'visible') {
                    elapsed += 10;
                    doSaveProgress(elapsed);
                }
            }, 10000);
        }

        this._currentVisHandler = () => { if (document.hidden) doSaveProgress(elapsed); };
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
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        
        const profile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
        if (!profile) return;

        await supabaseClient.from('watch_history').upsert({
            user_id: user.id,
            profile_id: profile.id, // Fase 3
            tmdb_id: Number(tmdbId), // Esquema: integer
            type,
            season_number: season || 0,
            episode_number: episode || 0,
            progress_seconds: seconds,
            last_watched: new Date().toISOString()
        }, { onConflict: 'user_id,profile_id,tmdb_id,type,season_number,episode_number' });
    },

    async _getProgress(tmdbId, type, season, episode, supabaseClient) {
        if (!supabaseClient || !this.currentUserId) return null;
        const profile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
        if (!profile) return null;

        let query = supabaseClient.from('watch_history')
            .select('progress_seconds')
            .eq('user_id', this.currentUserId)
            .eq('profile_id', profile.id) // Fase 3
            .eq('tmdb_id', String(tmdbId))
            .eq('type', type)
            .eq('season_number', season || 0)
            .eq('episode_number', episode || 0);
        
        const { data } = await query.maybeSingle();
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

    async toggleFavorite(supabase) {
        const btn = document.getElementById('btnAddToMyList');
        const isAdded = btn.classList.contains('added-to-list');
        const profile = JSON.parse(sessionStorage.getItem('vivotv_current_profile'));
        if (!profile) return;

        if (isAdded) {
            await supabase.from('user_favorites').delete()
                .eq('user_id', this.currentUserId)
                .eq('profile_id', profile.id) // Fase 3
                .eq('tmdb_id', Number(this.currentTmdbId));
        } else {
            await supabase.from('user_favorites').insert({ 
                user_id: this.currentUserId, 
                profile_id: profile.id, // Fase 3
                tmdb_id: Number(this.currentTmdbId),
                type: this.currentType // movie o tv
            });
        }
        this.checkIfFavorite(supabase);
        showToast(isAdded ? 'Eliminado de Mi Lista' : 'Añadido a Mi Lista');
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
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') PLAYER_LOGIC.closeModal();
});
