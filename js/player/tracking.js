/* ============================================================================
   VivoTV Player - Tracking & Progress Synchronization Module
   ============================================================================ */
import { getSupabase } from './state.js';
import { showToast } from '../utils.js';
import { VIVOTV_DB } from '../db.js';

export const trackingMethods = {
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
        this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, Math.floor(seek), getSupabase());
        
        this._stopProgressTimer();

        // DEBOUNCED SAVE (Telemetría eficiente - Alta Precisión: 15s)
        const doSave = (isPeriodicCall = false) => {
            if (video && hasJumped) {
                const cur = Math.floor(video.currentTime);
                if (cur !== lastSavedTime && cur > 0) {
                    this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, cur, getSupabase(), isPeriodicCall);
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

        // Backup de salvado cada 5s (Alta Precisión - Solicitud de Usuario)
        this.progressTimer = setInterval(() => { if (!video.paused) doSave(true); }, 5000);

        // Visibility & Unload Tracking (Asegura guardar telemetría si cierran ventana o minimizan)
        this._currentVisHandler = () => { if (document.hidden) doSave(false); };
        this._currentBeforeUnloadHandler = () => { doSave(false); };
        this._currentPageHideHandler = () => { doSave(false); };
        document.addEventListener('visibilitychange', this._currentVisHandler);
        window.addEventListener('beforeunload', this._currentBeforeUnloadHandler);
        window.addEventListener('pagehide', this._currentPageHideHandler);

        // Guardado al pausar (Event Driven)
        // Guardado al terminar + Siguiente Episodio
        // --- EVENTOS WATCH PARTY (Sincronización Instantánea) ---
        const forceSync = () => window.dispatchEvent(new CustomEvent('vivotv:force_party_sync'));
        video.onplay = () => { forceSync(); };
        video.onpause = () => { doSave(false); forceSync(); };
        video.onseeked = () => { forceSync(); };

        video.onended = () => {
            doSave(false);
            this._stopProgressTimer();

            if (this.currentType === 'tv') {
                // BUG FIX: _getNextEpisode es async — se necesita .then()
                // Antes se llamaba sin await, recibiendo una Promise en vez del episodio.
                this._getNextEpisode().then(nextEp => {
                    if (nextEp) this._showMarathonCountdown(nextEp, getSupabase());
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
                    // El botón se muestra con diseño Netflix/Disney+. No se fuerza salto ciego para no interrumpir anuncios.
                }
            } else {
                skipBtn?.classList.remove('active');
            }
        };

        // Guardar progreso al pausar video nativo
        video.onpause = () => {
            doSave(false);
            forceSync();
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
        this.iframeElapsed = seekSeconds;
        let lastSavedElapsed = -1;

        const doSaveProgress = (currentSecs, isPeriodicCall = false) => {
            // Umbral reducido de 10s a 2s para precisión "Netflix Style"
            if (currentSecs > 0 && Math.abs(currentSecs - lastSavedElapsed) >= 2) {
                this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, Math.floor(currentSecs), getSupabase(), isPeriodicCall);
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
                                doSaveProgress(this.ytPlayer.getCurrentTime(), false);
                            }
                        }
                    }
                });
                this.progressTimer = setInterval(() => {
                    if (this.ytPlayer && this.ytPlayer.getPlayerState) {
                        if (this.ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                            this.iframeElapsed = this.ytPlayer.getCurrentTime();
                            doSaveProgress(this.iframeElapsed, true);
                            
                            const duration = this.ytPlayer.getDuration();
                            this._checkBingeWatch(this.iframeElapsed, duration);
                        }
                    }
                }, 5000);
            };
            if (typeof YT !== 'undefined' && YT.Player) initYT();
            else window.onYouTubeIframeAPIReady = initYT;
        } 
        // --- OPCIÓN B: VIMEO SDK ---
        else if (url.includes('vimeo.com')) {
            this.vimeoPlayer = new Vimeo.Player(iframe);
            this.vimeoPlayer.on('pause', (data) => doSaveProgress(data.seconds, false));
            this.progressTimer = setInterval(() => {
                this.vimeoPlayer.getCurrentTime().then(secs => {
                    this.iframeElapsed = secs;
                    doSaveProgress(this.iframeElapsed, true);
                    
                    this.vimeoPlayer.getDuration().then(duration => {
                        this._checkBingeWatch(this.iframeElapsed, duration);
                    });
                });
            }, 5000);
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
                const isPlayerActive = !document.getElementById('playerContainer')?.classList.contains('hidden');
                const isVisible = document.visibilityState === 'visible';
                // No contar si el iframe envió señal de pausa o la pestaña no es visible
                if (!isPlayerActive || !isVisible || this._isPausedEst) return;
                this.iframeElapsed += 5;
                doSaveProgress(this.iframeElapsed, true);
            }, 5000);
        }

        this._currentVisHandler = () => {
            if (document.hidden) {
                doSaveProgress(this.iframeElapsed, false);
                // Si va a segundo plano, pausar el estimador del iframe
                if (this._isPausedEst !== undefined) this._isPausedEst = true;
            } else {
                if (this._isPausedEst !== undefined) this._isPausedEst = false;
            }
        };
        this._currentBeforeUnloadHandler = () => { doSaveProgress(this.iframeElapsed, false); };
        this._currentPageHideHandler = () => { doSaveProgress(this.iframeElapsed, false); };
        document.addEventListener('visibilitychange', this._currentVisHandler);
        window.addEventListener('beforeunload', this._currentBeforeUnloadHandler);
        window.addEventListener('pagehide', this._currentPageHideHandler);
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
        this.iframeElapsed = 0;
        this._bingePromptShown = false;

        // Limpiar timer de error de iframe
        if (this.iframeErrorTimer) {
            clearTimeout(this.iframeErrorTimer);
            this.iframeErrorTimer = null;
        }

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
        if (this._currentPageHideHandler) {
            window.removeEventListener('pagehide', this._currentPageHideHandler);
            this._currentPageHideHandler = null;
        }
    },

async _saveProgress(tmdbId, type, season, episode, seconds, supabaseClient, isPeriodic = false) {
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
            // Marcar como visto al 85% — Compensamos créditos largos
            isWatched = pct >= 0.85;
        } else {
            // Sin duración confiable: marcar como visto si lleva > 60 min en películas
            // o > 15 min en series (un episodio estándar de 20 min)
            const threshold = (type === 'movie') ? 3600 : 900;
            isWatched = seconds >= threshold;
        }

        console.log(`[Player] Guardando progreso: ${finalTmdbId} -> ${seconds}s | visto: ${isWatched} | isPeriodic: ${isPeriodic}`);

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
        } else {
            if (!isPeriodic) {
                console.log('[Player] Despachando evento update-recent');
                window.dispatchEvent(new CustomEvent('update-recent'));
            }
        }

        // Si quedó marcado como visto, actualizar el badge en la UI sin recargar
        if (isWatched) {
            const cards = document.querySelectorAll(`[data-tmdb="${finalTmdbId}"], [data-id="${finalTmdbId}"]`);
            cards.forEach(card => {
                card.querySelector('.watched-badge')?.classList.remove('hidden');
                card.querySelector('.available-badge')?.classList.add('hidden');
                card.querySelector('.card-progress-bar')?.classList.add('hidden');
            });

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

forceSaveCurrentProgress() {
        try {
            const video = document.getElementById('videoPlayer');
            if (video && !video.classList.contains('hidden')) {
                const cur = Math.floor(video.currentTime);
                if (cur > 0) {
                    this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, cur, getSupabase());
                    console.log('[Player] Forzado salvado - Nativo:', cur);
                }
            }

            if (this.currentIsIframe) {
                if (this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function') {
                    const cur = Math.floor(this.ytPlayer.getCurrentTime());
                    if (cur > 0) {
                        this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, cur, getSupabase());
                        console.log('[Player] Forzado salvado - YouTube:', cur);
                    }
                } else if (this.vimeoPlayer && typeof this.vimeoPlayer.getCurrentTime === 'function') {
                    this.vimeoPlayer.getCurrentTime().then(cur => {
                        const secs = Math.floor(cur);
                        if (secs > 0) {
                            this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, secs, getSupabase());
                            console.log('[Player] Forzado salvado - Vimeo:', secs);
                        }
                    });
                } else if (this.iframeElapsed > 0) {
                    this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, Math.floor(this.iframeElapsed), getSupabase());
                    console.log('[Player] Forzado salvado - Iframe Genérico (Opción C):', this.iframeElapsed);
                }
            }
        } catch (e) {
            console.warn('[Player] Error al forzar salvado:', e);
        }
    }
};
