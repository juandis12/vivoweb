/* ============================================================================
   VivoTV Player - Core Engine & Playback Module
   ============================================================================ */
import { getSupabase, getCurrentServers, setCurrentServers } from './state.js';
import { CONFIG } from '../config.js';
import { showToast } from '../utils.js';
import { StreamService } from '../services/StreamService.js';

export const coreMethods = {
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
        const dModal = document.getElementById('detailModal');
        if (dModal) dModal.classList.add('is-playing-video');
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

        this.playbackStarted = false;

        if (isIframe && !isDirectStream) {
            video.classList.add('hidden');
            iframe.classList.remove('hidden');
            video.pause();
            // AISLAMIENTO TOTAL: Purgar handlers y src del video nativo para evitar errores fantasmas de anuncios/red
            video.onerror = null;
            video.onended = null;
            video.onpause = null;
            video.ontimeupdate = null;
            video.src = '';
            video.removeAttribute('src');
            try { video.load(); } catch (e) {}

            // ESCUDO ANTI-POPUPS: Bloquea ventanas emergentes, redirecciones y pestañas comerciales
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');

            if (smartUrl.includes('facebook.com')) {
                iframe.setAttribute('referrerpolicy', 'no-referrer');
            } else if (smartUrl.includes('vimeus.com')) {
                iframe.setAttribute('referrerpolicy', 'origin');
            } else {
                iframe.removeAttribute('referrerpolicy');
            }

            // Forzar autoplay en iframes comunes si no lo tienen
            let finalUrl = smartUrl;
            if (!finalUrl.includes('autoplay=')) {
                finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'autoplay=1&muted=1';
            }

            iframe.onload = () => {
                if (iframe.src === '' || iframe.src.includes('about:blank')) return;
                console.log('[Player] Iframe cargado correctamente. Cancelando timer de error.');
                if (this.iframeErrorTimer) {
                    clearTimeout(this.iframeErrorTimer);
                    this.iframeErrorTimer = null;
                }
                if (loader) loader.classList.add('hidden');
            };

            iframe.src = finalUrl;
            this.currentIsIframe = true;
            this._startIframeTracking(seekSeconds, iframe);
            
            // Limpiar timers previos si existen
            if (this.iframeErrorTimer) {
                clearTimeout(this.iframeErrorTimer);
                this.iframeErrorTimer = null;
            }

            // FIX: Ya NO cambiamos de servidor en automático con un temporizador rígido.
            // Los anuncios de iframes (pre-roll) duran entre 15 y 30 segundos.
            // Si el temporizador forzaba el cambio a los 15s, reiniciaba el reproductor
            // e interrumpía la película o el anuncio en un bucle infinito.
            // En su lugar, ocultamos el loader a los 3-4 segundos para que el usuario pueda
            // interactuar con el reproductor y saltar el anuncio normalmente.
            if (loader) {
                setTimeout(() => {
                    if (loader) loader.classList.add('hidden');
                }, 3500);
            }
        } else {
            iframe.classList.add('hidden');
            video.classList.remove('hidden');
            iframe.src = 'about:blank';
            iframe.onload = null;
            this.currentIsIframe = false;

            // Escuchar inicio de reproducción real
            video.addEventListener('playing', () => {
                this.playbackStarted = true;
            }, { once: true });

            // Manejo Robusto de Errores: NUNCA cambiar de servidor en medio de una película o anuncio
            video.onerror = () => {
                if (this.playbackStarted || (video.currentTime > 3)) {
                    console.warn('[Player] ⚠️ Buffer o anuncio demorado. Manteniendo servidor activo para no reiniciar reproducción.');
                    this._showServerIssuePrompt(seekSeconds);
                    return;
                }
                // Solo intentar fallback al inicio si el enlace directo está completamente muerto
                this._tryNextServer(seekSeconds).then(success => {
                    if (!success) this.showContentError(container, this.currentType);
                });
            };
            
            // Forzar inicio automático silenciado (Muted Autoplay)
            video.muted = true;

            // Listener para fin de video (Solo streams directos)
            if (isDirectStream) {
                video.onended = () => {
                    // Forzar guardado como visto al terminar
                    this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, Math.floor(video.duration), getSupabase());
                    
                    if (this.currentType === 'tv') {
                        this._getNextEpisode().then(nextEp => {
                            if (nextEp) this._showNextEpisodePrompt(nextEp);
                        });
                    }
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

                // TV BOX & WEB SAFE BUFFERING: No cambiar de servidor apresuradamente.
                // El buffering normal o pausas de anuncios pueden durar entre 10 y 20s.
                let _stallTimer = null;
                const _onStall = () => {
                    if (_stallTimer) clearTimeout(_stallTimer);
                    _stallTimer = setTimeout(() => {
                        if (video.readyState < 3 && !video.ended && !video.paused) {
                            console.warn('[Player] Stream estancado > 25s. Intentando recargar buffer...');
                            video.load();
                            video.play().catch(() => {});
                        }
                    }, 25000);
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

async _loadMovieSource(tmdbId, supabaseClient) {
        const { data, error } = await supabaseClient.from('video_sources')
            .select('stream_url, stream_url_vidsrc, stream_url_2embed, stream_url_superembed')
            .eq('tmdb_id', Number(tmdbId))
            .maybeSingle();

        let movieData = data;
        if (error || !movieData) {
            console.log(`[Player] Película no encontrada en Supabase. Autogenerando enlaces de fallback para TMDB ${tmdbId}...`);
            movieData = {
                stream_url: `https://vimeus.com/e/movie?tmdb=${tmdbId}&view_key=${CONFIG.VIMEUS_VIEW_KEY}`,
                stream_url_vidsrc: `https://vidsrc.xyz/embed/movie/${tmdbId}`,
                stream_url_2embed: `https://www.2embed.cc/embed/${tmdbId}`,
                stream_url_superembed: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`
            };
        } else {
            if (!movieData.stream_url) movieData.stream_url = `https://vimeus.com/e/movie?tmdb=${tmdbId}&view_key=${CONFIG.VIMEUS_VIEW_KEY}`;
            if (!movieData.stream_url_vidsrc) movieData.stream_url_vidsrc = `https://vidsrc.xyz/embed/movie/${tmdbId}`;
            if (!movieData.stream_url_2embed) movieData.stream_url_2embed = `https://www.2embed.cc/embed/${tmdbId}`;
            if (!movieData.stream_url_superembed) movieData.stream_url_superembed = `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`;
        }

        const progressObj = await this._getProgress(tmdbId, 'movie', 0, 0, supabaseClient);
        const seek = progressObj?.progress_seconds || 0;

        const sanitizeUrl = (url) => url ? url.trim() : '';

        const rawServers = [
            { name: 'Vimeus (Principal)', url: sanitizeUrl(movieData.stream_url) },
            { name: 'Servidor VIP 1', url: sanitizeUrl(movieData.stream_url_vidsrc) },
            { name: 'Servidor VIP 2', url: sanitizeUrl(movieData.stream_url_2embed) },
            { name: 'Servidor Directo', url: sanitizeUrl(movieData.stream_url_superembed) }
        ].filter(s => s.url && s.url.trim() !== '');

        let servers = [...rawServers];

        if (servers.length > 1) {
            this.showServerSelector(servers, seek);
        }

        // Binge Watch & Social
        this._estimatedDuration = (this.movieData?.runtime || 120) * 60;
        import('./binge-engine.js').then(m => m.BingeEngine.loadContentMetadata(tmdbId, 'movie'));
        if (window.SOCIAL_PULSE) window.SOCIAL_PULSE.attach(tmdbId, 'movie');
        if (window.ACHIEVEMENTS) window.ACHIEVEMENTS.track('play_video', {
            type: 'movie',
            genre: this.movieData?.genres?.[0]?.id
        });

        this._playSource(servers[0].url, seek);
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
        this._estimatedDuration = (ep.runtime || (this.seriesData?.episode_run_time?.[0]) || 45) * 60;
        // Social Pulse: mostrar barra de reacciones en tiempo real
        import('./binge-engine.js').then(m => m.BingeEngine.loadContentMetadata(tmdbId, 'tv'));
        if (window.SOCIAL_PULSE) window.SOCIAL_PULSE.attach(tmdbId, 'tv');
        // Achievements: trackear reproducción de episodio
        if (window.ACHIEVEMENTS) window.ACHIEVEMENTS.track('play_video', {
            type: 'tv',
            genre: this.seriesData?.genres?.[0]?.id
        });

        // Preparar servidores para series
        const sanitizeUrl = (url) => url ? url.trim() : '';

        const rawServers = [
            { name: 'Vimeus (Principal)', url: sanitizeUrl(ep.stream_url) },
            { name: 'Servidor VIP 1', url: sanitizeUrl(ep.stream_url_vidsrc) },
            { name: 'Servidor VIP 2', url: sanitizeUrl(ep.stream_url_2embed) },
            { name: 'Servidor Directo', url: sanitizeUrl(ep.stream_url_superembed) }
        ].filter(s => s.url && s.url.trim() !== '');

        let servers = [...rawServers];

        if (servers.length > 1) {
            this.showServerSelector(servers, seekSeconds);
        }

        this._playSource(servers[0].url, seekSeconds);
    },

_hasNextServer() {
        return getCurrentServers() && getCurrentServers().length > 1;
    },

async _tryNextServer(seekSeconds = 0) {
        if (!this._hasNextServer()) return false;
        
        // Normalizar URLs limpiando parámetros para coincidencia exacta
        const currentRaw = (this.currentIsIframe ?
            (document.getElementById('videoIframe')?.src || '') :
            (document.getElementById('videoPlayer')?.src || ''));
        const currentUrl = currentRaw.split('?')[0].split('#')[0];

        const currentIndex = getCurrentServers().findIndex(s => {
            const sClean = (s.url || '').split('?')[0].split('#')[0];
            return sClean === currentUrl;
        });
        
        const nextIndex = (currentIndex + 1) % getCurrentServers().length;
        if (nextIndex === 0 && currentIndex !== -1) {
            console.warn('[Player] Se han probado todos los servidores.');
            return false;
        }

        const nextServer = getCurrentServers()[nextIndex];
        showToast(`Reintentando con: ${nextServer.name}...`, 'warning');
        this._playSource(nextServer.url, seekSeconds);
        return true;
    },

/**
     * Muestra notificación flotante interactiva estilo Netflix / Disney+ si hay problemas con el servidor
     */
    _showServerIssuePrompt(seekSeconds = 0) {
        let existing = document.getElementById('playerServerPrompt');
        if (existing) return;

        const container = document.getElementById('playerContainer') || document.querySelector('.player-container');
        if (!container) return;

        const prompt = document.createElement('div');
        prompt.id = 'playerServerPrompt';
        prompt.className = 'player-server-prompt glass-panel';
        prompt.innerHTML = `
            <div class="server-prompt-header">
                <span class="server-prompt-icon">⚠️</span>
                <div class="server-prompt-texts">
                    <h4>¿Problemas con el servidor actual?</h4>
                    <p>La reproducción parece demorada o con anuncios prolongados.</p>
                </div>
            </div>
            <div class="server-prompt-actions">
                <button type="button" class="btn btn-sm btn-primary" id="btnPromptSwitch">
                    Cambiar Servidor
                </button>
                <button type="button" class="btn btn-sm btn-secondary" id="btnPromptSelector">
                    Ver Servidores
                </button>
                <button type="button" class="btn btn-sm btn-outline" id="btnPromptDismiss">
                    Continuar Esperando
                </button>
            </div>
        `;

        container.appendChild(prompt);
        requestAnimationFrame(() => prompt.classList.add('show'));

        const btnSwitch = prompt.querySelector('#btnPromptSwitch');
        if (btnSwitch) {
            btnSwitch.onclick = () => {
                prompt.remove();
                this._tryNextServer(seekSeconds);
            };
        }

        const btnSelector = prompt.querySelector('#btnPromptSelector');
        if (btnSelector) {
            btnSelector.onclick = () => {
                prompt.remove();
                if (getCurrentServers() && getCurrentServers().length > 0) {
                    this.showServerSelector(getCurrentServers(), seekSeconds);
                } else {
                    this._tryNextServer(seekSeconds);
                }
            };
        }

        const btnDismiss = prompt.querySelector('#btnPromptDismiss');
        if (btnDismiss) {
            btnDismiss.onclick = () => {
                prompt.classList.remove('show');
                setTimeout(() => prompt.remove(), 400);
            };
        }

        setTimeout(() => {
            if (prompt.parentNode) {
                prompt.classList.remove('show');
                setTimeout(() => prompt.remove(), 400);
            }
        }, 14000);
    },

showContentError(container, type = 'movie') {
        // Overlay de error desactivado por petición del usuario
        console.warn(`[Player] Error de carga para ${type}, pero el overlay está desactivado.`);
        
        if (this.currentTmdbId) {
            const idStr = this.currentTmdbId.toString();
            const failedArray = JSON.parse(localStorage.getItem('vivotv_failed_ids') || '[]');
            if (!failedArray.includes(idStr)) {
                failedArray.push(idStr);
                localStorage.setItem('vivotv_failed_ids', JSON.stringify(failedArray));
            }
            if (window.failedIds) {
                window.failedIds.add(idStr);
            } else {
                window.failedIds = new Set(failedArray);
            }
            window.dispatchEvent(new CustomEvent('update-ui-availability'));
        }

        // Mantener la lógica de limpieza crítica
        this._stopProgressTimer();
        const loader = document.getElementById('playerLoader');
        if (loader) loader.classList.add('hidden');
    }
};
