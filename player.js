import { CONFIG } from './config.js';
import { TMDB_SERVICE, CATALOG_UI } from './tmdb.js';
import { showToast } from './utils.js';

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
        this.renderSimilar(data.id, data.title ? 'movie' : 'tv', availableIds);
    },

    async renderSimilar(id, type, availableIds) {
        let similarSection = document.getElementById('similarTitlesSection');
        if (!similarSection) {
            similarSection = document.createElement('section');
            similarSection.id = 'similarTitlesSection';
            similarSection.className = 'details-section';
            similarSection.innerHTML = `
                <h3 class="section-label">Títulos Similares</h3>
                <div class="similar-grid" id="similarGrid"></div>
            `;
            const mainCol = document.querySelector('.details-main-col');
            if (mainCol) mainCol.appendChild(similarSection);
        }

        const grid = document.getElementById('similarGrid');
        if (!grid) return;
        
        grid.innerHTML = '<div class="loader-wave"><span></span><span></span><span></span></div>';
        
        try {
            const data = await TMDB_SERVICE.fetchFromTMDB(`/${type}/${id}/similar`);
            grid.innerHTML = '';
            
            const results = (data.results || []).slice(0, 12);
            if (results.length === 0) {
                similarSection.classList.add('hidden');
                return;
            }

            similarSection.classList.remove('hidden');
            results.forEach(item => {
                const isAvail = availableIds.has(item.id.toString()) || availableIds.has(item.id);
                const card = CATALOG_UI.createMovieCard(item, type, isAvail);
                grid.appendChild(card);
            });
        } catch (e) { 
            console.error('Error similar titles:', e);
            similarSection.classList.add('hidden');
        }
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
        this._playSource(ep.stream_url, seekSeconds);
        // El guardado de progreso se iniciará automáticamente mediante el timer del reproductor
    },

    _playSource(url, seekSeconds = 0) {
        const video = document.getElementById('videoPlayer');
        const iframe = document.getElementById('videoIframe');
        const container = document.getElementById('playerContainer');
        const loader = document.getElementById('playerLoader');

        // Reset listeners previos para evitar duplicados
        video.onended = null;

        container.classList.remove('hidden');
        loader.classList.remove('hidden');

        // --- CONVERSOR INTELIGENTE DE URLS ---
        const smartUrl = this._getSmartUrl(url, seekSeconds);
        const isDirectStream = /\.(mp4|m3u8|webm|ogg|ts)([?#]|$)/i.test(smartUrl);
        
        // Listener para fin de video (Solo streams directos)
        if (isDirectStream && this.currentType === 'tv') {
            video.onended = () => {
                const nextEp = this._getNextEpisode();
                if (nextEp) this._showMarathonCountdown(nextEp, _supabase);
            };
        }
        const isFacebook = smartUrl.includes('facebook.com');
        
        setTimeout(() => {
            loader.classList.add('hidden');
            if (isDirectStream) {
                iframe.classList.add('hidden');
                video.classList.remove('hidden');
                this._startVideoTracking(video, seekSeconds);
            } else {
                video.classList.add('hidden');
                iframe.classList.remove('hidden');
                
                // --- AJUSTE DE SEGURIDAD (FASE 3) ---
                iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
                if (isFacebook) {
                    iframe.setAttribute('referrerpolicy', 'no-referrer');
                } else {
                    iframe.removeAttribute('referrerpolicy');
                }
                
                iframe.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen');
                iframe.src = smartUrl;
                this._startIframeTracking(seekSeconds);
            }
        }, 1000);
    },

    _getSmartUrl(url, seekSeconds = 0) {
        if (!url) return '';
        let cleanUrl = url.trim();

        // 1. YouTube
        if (cleanUrl.includes('youtube.com/watch?v=') || cleanUrl.includes('youtube.com/v/')) {
            const id = cleanUrl.split(/v\/|v=/)[1].split(/[?&]/)[0];
            return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0${seekSeconds > 0 ? '&start=' + seekSeconds : ''}`;
        }
        if (cleanUrl.includes('youtu.be/')) {
            const id = cleanUrl.split('youtu.be/')[1].split(/[?&]/)[0];
            return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0${seekSeconds > 0 ? '&start=' + seekSeconds : ''}`;
        }
        // 2. Vimeo (Fix para soportar subdominios y parámetros extra)
        if (cleanUrl.includes('vimeo.com/') && !cleanUrl.includes('player.vimeo.com')) {
            const parts = cleanUrl.split('vimeo.com/')[1].split(/[?&]/);
            const id = parts[0];
            return `https://player.vimeo.com/video/${id}?autoplay=1&title=0&byline=0&portrait=0${seekSeconds > 0 ? '#t=' + seekSeconds + 's' : ''}`;
        }
        // 3. Facebook
        if (cleanUrl.includes('facebook.com/') && !cleanUrl.includes('plugins/video.php')) {
            return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(cleanUrl)}&show_text=0&width=1280${seekSeconds > 0 ? '&t=' + seekSeconds : ''}`;
        }
        
        // 4. Intentar inyectar tiempo en reproductores genéricos
        if (seekSeconds > 0 && !cleanUrl.includes('?t=') && !cleanUrl.includes('&t=') && !cleanUrl.includes('#t=')) {
            // Utilizamos el hash estándar HTML5 Media Fragment
            cleanUrl += `${cleanUrl.includes('#') ? '&' : '#'}t=${seekSeconds}`;
        }
        
        return cleanUrl;
    },

    _startVideoTracking(video, seek) {
        let hasJumped = seek <= 0;
        let lastSavedTime = -1;

        // --- SALTO INTELIGENTE CON RETRASO (Fase 10X UX) ---
        // Ajustado a 10 segundos para sincronizar con la duración de los anuncios
        if (seek > 0) {
            console.log(`[VivoTV] Programando salto de progreso (${seek}s) en 10 segundos...`);
            setTimeout(() => {
                if (video && !video.paused) {
                    video.currentTime = seek;
                    hasJumped = true;
                    showToast("Reanudando desde donde te quedaste...", "info");
                }
            }, 10000); // 10 segundos de espera
        }

        this._createSmartControls();
        video.play().catch(() => {});
        
        // --- PULSO INICIAL (Fase 6) ---
        this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, Math.floor(seek), _supabase);
        
        this._stopProgressTimer();

        // DEBOUNCED SAVE (Telemetría eficiente)
        const doSave = () => {
            if (video && hasJumped) {
                const cur = Math.floor(video.currentTime);
                if (cur !== lastSavedTime && cur > 0) {
                    this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, cur, _supabase);
                    lastSavedTime = cur;
                }
            }
        };

        // Backup de salvado cada 60s (reduciendo un 75% las peticiones a Supabase)
        this.progressTimer = setInterval(() => { if (!video.paused) doSave(); }, 60000);

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
                const nextEp = this._getNextEpisode();
                if (nextEp) this._showMarathonCountdown(nextEp, _supabase);
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

            // Detección de Intro (Primeros 3 minutos)
            if (cur > 10 && cur < 180) {
                document.getElementById('btnSkipIntro')?.classList.add('active');
            } else {
                document.getElementById('btnSkipIntro')?.classList.remove('active');
            }
        };
    },

    _startIframeTracking(seekSeconds = 0) {
        this._stopProgressTimer();
        
        // --- PULSO INICIAL (Fase 6) ---
        this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, seekSeconds, _supabase);

        let elapsed = seekSeconds;
        let lastSavedElapsed = -1;

        const doSaveIframe = () => {
            if (elapsed !== lastSavedElapsed) {
                this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, elapsed, _supabase);
                lastSavedElapsed = elapsed;
            }
        };

        // Tick local interno simulando el video, se envía a Supabase solo cada 60s
        let ticks = 0;
        this.progressTimer = setInterval(() => {
            elapsed += 15;
            ticks++;
            if (ticks % 4 === 0) doSaveIframe(); // cada 60s envía
        }, 15000);

        this._currentVisHandler = () => { if (document.hidden) doSaveIframe(); };
        this._currentBeforeUnloadHandler = () => { doSaveIframe(); };
        document.addEventListener('visibilitychange', this._currentVisHandler);
        window.addEventListener('beforeunload', this._currentBeforeUnloadHandler);
    },

    _stopProgressTimer() {
        if (this.progressTimer) clearInterval(this.progressTimer);
        this.progressTimer = null;
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
        
        const profile = JSON.parse(sessionStorage.getItem('vivotv_current_profile'));
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
        const profile = JSON.parse(sessionStorage.getItem('vivotv_current_profile'));
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
        const profile = JSON.parse(sessionStorage.getItem('vivotv_current_profile'));
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

    closeModal() {
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

    _getNextEpisode() {
        // Navegación automática deshabilitada sin caching
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
