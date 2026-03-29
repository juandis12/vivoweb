import { CONFIG } from './config.js';
import { TMDB_SERVICE } from './tmdb.js';
import { showToast } from './utils.js';

// ──────────────────────────────────────────────
// Referencias al supabase client (se asigna desde app.js)
// ──────────────────────────────────────────────
let _supabase = null;
export function setSupabase(client) { _supabase = client; }

export const PLAYER_LOGIC = {

    hls: null,
    currentUserId: null,
    currentType: null,
    currentSeason: null,
    currentEpisode: null,
    progressTimer: null,
    seriesData: null,
    lastSeriesProgress: null, // NUEVO: Para continuidad global de series
    skipIntroTimer: null,     // NUEVO: Para el auto-salto

    // ──────────────────────────────
    // ABRIR DETALLE
    // ──────────────────────────────
    async openDetail(tmdbId, type = 'movie', supabaseClient) {
        _supabase = supabaseClient;
        this.currentTmdbId = tmdbId;
        this.currentType   = type;
        this.currentSeason = null;
        this.currentEpisode = null;
        this.seriesData    = null;
        this._stopProgressTimer();

        const modal       = document.getElementById('detailModal');
        const videoPlayer = document.getElementById('videoPlayer');
        const videoIframe = document.getElementById('videoIframe');
        const placeholder = document.getElementById('videoPlaceholder');
        const backdrop    = document.getElementById('modalBackdrop');
        const seriesInfo  = document.getElementById('seriesInfo');

        // Reset UI
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        document.getElementById('playerContainer')?.classList.remove('active'); // ESCONDER POR DEFECTO
        
        // OCULTAR PEBBLE SI EXISTE
        document.querySelector('.glass-floating-card')?.style.setProperty('display', 'none', 'important');

        videoPlayer.classList.add('hidden');
        videoIframe.classList.add('hidden');
        videoIframe.src = '';
        placeholder.classList.remove('hidden');
        placeholder.innerHTML = '<div class="placeholder-inner"><p>Verificando disponibilidad...</p></div>';
        seriesInfo.classList.add('hidden');
        document.getElementById('episodesSection')?.classList.add('hidden');

        if (this.hls) { this.hls.destroy(); this.hls = null; }
        videoPlayer.pause();
        videoPlayer.src = '';

        try {
            const details = await TMDB_SERVICE.getDetails(tmdbId, type);
            this.updateModalUI(details);

            if (details.backdrop_path) {
                backdrop.style.backgroundImage =
                    `url('${CONFIG.TMDB_IMAGE_BASE}${details.backdrop_path}')`;
            }

            // Si es serie → mostrar info + cargar episodios
            if (type === 'tv' || details.media_type === 'tv') {
                this.seriesData = details;
                // Detectar último episodio visto globalmente para esta serie
                await this.detectGlobalSeriesProgress(tmdbId, supabaseClient);
                await this.renderSeriesInfo(details, supabaseClient);
                // No carga video hasta que el usuario elija episodio
                placeholder.innerHTML = `
                    <div class="placeholder-inner">
                        <svg viewBox="0 0 24 24" width="48" fill="rgba(255,255,255,0.12)">
                            <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>
                        </svg>
                        <p>Selecciona una temporada y episodio para reproducir</p>
                    </div>`;
            } else {
                // Película: buscar en video_sources
                await this._loadMovieSource(tmdbId, supabaseClient);
            }

            this.checkIfFavorite(supabaseClient);

        } catch (err) {
            console.error('Error openDetail:', err);
            placeholder.innerHTML = `
                <div class="placeholder-inner">
                    <p>Error al cargar. Inténtalo de nuevo.</p>
                </div>`;
        }
    },

    // ──────────────────────────────
    // CARGA FUENTE DE PELÍCULA
    // ──────────────────────────────
    async _loadMovieSource(tmdbId, supabaseClient) {
        const placeholder = document.getElementById('videoPlaceholder');
        const id = String(tmdbId);
        const { data, error } = await supabaseClient
            .from('video_sources')
            .select('stream_url')
            .eq('tmdb_id', id)
            .maybeSingle();

        if (error) console.error('[VivoTV] Error loading source:', error);

        if (error || !data?.stream_url) {
            placeholder.innerHTML = `
                <div class="placeholder-inner">
                    <svg viewBox="0 0 24 24" width="48" fill="rgba(255,255,255,0.12)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                    <p>Sin enlace disponible para este título</p>
                </div>`;
        } else {
            // Check progress
            const progressObj = await this._getProgress(tmdbId, 'movie', null, null, supabaseClient);
            const savedSecs  = progressObj?.progress_seconds || 0;

            if (savedSecs > 60) {
                this.showFloatingResumeCard({
                    thumb: `${CONFIG.TMDB_IMAGE_CARD}${this.seriesData?.poster_path || ''}`,
                    title: '¿Continuar viendo?',
                    desc: `Te quedaste en el minuto ${this.formatTime(savedSecs)}`,
                    onResume: () => this._playSource(data.stream_url, savedSecs),
                    onRestart: () => {
                        this._playSource(data.stream_url, 0);
                        this._saveProgress(tmdbId, 'movie', null, null, 0, supabaseClient);
                    }
                });
            } else {
                this._playSource(data.stream_url, 0);
            }
            
            // Initial log to history
            this._saveProgress(tmdbId, 'movie', null, null, 0, supabaseClient);
        }
    },

    // ──────────────────────────────
    // INFO DE SERIES (temporadas + episodios disponibles)
    // ──────────────────────────────
    async renderSeriesInfo(data, supabaseClient) {
        const seriesInfo = document.getElementById('seriesInfo');
        const pills      = document.getElementById('seasonsPills');
        const episodesSection = document.getElementById('episodesSection');

        document.getElementById('statSeasons').textContent  = data.number_of_seasons  || '?';
        document.getElementById('statEpisodes').textContent = data.number_of_episodes || '?';
        const statusMap = {
            'Returning Series': '🟢 En curso',
            'Ended':            '🔴 Finalizada',
            'Canceled':         '⛔ Cancelada',
            'In Production':    '🔵 En producción',
        };
        document.getElementById('statStatus').textContent =
            statusMap[data.status] || data.status || '?';

        // Cargar episodios disponibles en Supabase para esta serie
        let dbEpisodes = [];
        if (supabaseClient) {
            const { data: eps } = await supabaseClient
                .from('series_episodes')
                .select('season_number, episode_number, stream_url')
                .eq('tmdb_id', data.id)
                .order('season_number')
                .order('episode_number');
            dbEpisodes = eps || [];
        }

        // Obtener historial de progreso de esta serie
        let progressMap = {};
        if (supabaseClient) {
            const { data: hist } = await supabaseClient
                .from('watch_history')
                .select('season_number, episode_number, progress_seconds, total_seconds')
                .eq('tmdb_id', data.id)
                .eq('type', 'tv');
            (hist || []).forEach(h => {
                progressMap[`${h.season_number}_${h.episode_number}`] = h;
            });
        }

        // Construir pills de temporadas
        pills.innerHTML = '';
        episodesSection.classList.add('hidden');
        const seasons = (data.seasons || []).filter(s => s.season_number > 0);

        seasons.forEach((season, idx) => {
            const dbEpsForSeason = dbEpisodes.filter(e => e.season_number === season.season_number);
            const hasAnyEps = dbEpsForSeason.length > 0;
            
            const pill = document.createElement('button');
            pill.className = `season-pill${idx === 0 ? ' active' : ''}`;
            pill.textContent = `T${season.season_number}`;
            pill.title = `${season.episode_count} episodios`;

            pill.addEventListener('click', () => {
                pills.querySelectorAll('.season-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.currentSeason = season.season_number;
                this._renderEpisodes(
                    data.id,
                    season.season_number,
                    season.episode_count,
                    dbEpsForSeason,
                    progressMap,
                    supabaseClient
                );
            });
            pills.appendChild(pill);

            // Auto-seleccionar primera temporada
            if (idx === 0) {
                this.currentSeason = season.season_number;
                this._renderEpisodes(
                    data.id,
                    season.season_number,
                    season.episode_count,
                    dbEpsForSeason,
                    progressMap,
                    supabaseClient
                );
            }
        });

        seriesInfo.classList.remove('hidden');
        
        // Si hay progreso global, mostrar la nueva tarjeta flotante innovadora
        if (this.lastSeriesProgress) {
            const p = this.lastSeriesProgress;
            this.showFloatingResumeCard({
                thumb: `${CONFIG.TMDB_IMAGE_CARD}${this.seriesData?.poster_path || ''}`,
                title: 'Continuar Serie',
                desc: `T${p.season_number} E${p.episode_number} — ${this.formatTime(p.progress_seconds)}`,
                onResume: () => this.resumeLastEpisode(p.season_number, p.episode_number),
                onRestart: null // En el global no damos opción de reiniciar todo
            });
        }
    },

    async detectGlobalSeriesProgress(tmdbId, supabaseClient) {
        if (!supabaseClient) return;
        const id = String(tmdbId);
        const { data } = await supabaseClient
            .from('watch_history')
            .select('season_number, episode_number, progress_seconds')
            .eq('tmdb_id', id)
            .eq('type', 'tv')
            .order('last_watched', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        this.lastSeriesProgress = data || null;
    },

    resumeLastEpisode(seasonNum, epNum) {
        // Encontrar la píldora de la temporada y hacerle click
        const pills = document.getElementById('seasonsPills');
        const seasonPill = Array.from(pills.querySelectorAll('.season-pill'))
            .find(p => p.textContent === `T${seasonNum}`);
        
        if (seasonPill) {
            seasonPill.click();
            // Esperar a que se rendericen los episodios y hacerle click al correcto
            setTimeout(() => {
                const grid = document.getElementById('episodesGrid');
                const epCard = Array.from(grid.querySelectorAll('.episode-card'))
                    .find(c => c.querySelector('.episode-number')?.textContent === `Ep ${epNum}`);
                
                if (epCard) {
                    epCard.click();
                    // Scroll suave hasta el reproductor para ver la acción
                    document.getElementById('playerContainer')?.scrollIntoView({ behavior: 'smooth' });
                }
            }, 300);
        }
    },

    // ──────────────────────────────
    // RENDERIZAR GRID DE EPISODIOS
    // ──────────────────────────────
    _renderEpisodes(tmdbId, seasonNum, totalEps, dbEpisodes, progressMap, supabaseClient) {
        const section = document.getElementById('episodesSection');
        const grid    = document.getElementById('episodesGrid');
        const title   = document.getElementById('episodesSectionTitle');

        title.textContent = `Temporada ${seasonNum} — ${totalEps} episodios`;
        grid.innerHTML = '';
        section.classList.remove('hidden');

        // Mapear episodios de DB por número para acceso rápido
        const epsMap = {};
        dbEpisodes.forEach(e => epsMap[e.episode_number] = e);

        // Crear tarjeta para CADA episodio del 1 al totalEps
        for (let i = 1; i <= totalEps; i++) {
            const epData = epsMap[i]; // ¿Está en Supabase?
            const key    = `${seasonNum}_${i}`;
            const prog   = progressMap[key];
            const pct    = prog && prog.total_seconds > 0
                ? Math.min(100, Math.round(prog.progress_seconds / prog.total_seconds * 100))
                : 0;

            const card = document.createElement('div');
            card.className = `episode-card${!epData ? ' disabled' : ''}`;
            if (!epData) card.style.opacity = '0.5';
            
            card.innerHTML = `
                <span class="episode-number">Ep ${i}</span>
                <span class="episode-label">${epData ? (pct > 0 ? `${pct}%` : 'Ver') : 'N/A'}</span>
                ${pct > 0 ? `<div class="episode-progress-bar" style="width:${pct}%"></div>` : ''}
            `;

            if (epData) {
                card.style.cursor = 'pointer';
                const play = () => {
                    grid.querySelectorAll('.episode-card').forEach(c => c.classList.remove('playing'));
                    card.classList.add('playing');
                    this.currentEpisode = i;
                    this._playEpisode(tmdbId, seasonNum, epData, supabaseClient, prog?.progress_seconds || 0);
                };
                card.addEventListener('click', play);
            } else {
                card.title = 'Este episodio aún no ha sido cargado en el sistema';
                card.style.cursor = 'not-allowed';
            }
            grid.appendChild(card);
        }
    },

    // ──────────────────────────────
    // REPRODUCIR UN EPISODIO
    // ──────────────────────────────
    async _playEpisode(tmdbId, seasonNum, ep, supabaseClient) {
        const placeholder = document.getElementById('videoPlaceholder');
        placeholder.innerHTML = '<div class="placeholder-inner"><p>Cargando información...</p></div>';

        // Check progress for this specific episode
        const progressObj = await this._getProgress(tmdbId, 'tv', seasonNum, ep.episode_number, supabaseClient);
        const savedSecs  = progressObj?.progress_seconds || 0;

        if (savedSecs > 30) {
            // OCULTAR placeholder mientras se muestra el prompt de Resume
            this.showResumePrompt(savedSecs,
                () => this._playSource(ep.stream_url, savedSecs), // Resume
                () => { // Start scratch
                    this._playSource(ep.stream_url, 0);
                    this._saveProgress(tmdbId, 'tv', seasonNum, ep.episode_number, 0, supabaseClient);
                }
            );
        } else {
            this._playSource(ep.stream_url, 0);
            await this._saveProgress(tmdbId, 'tv', seasonNum, ep.episode_number, 0, supabaseClient);
        }

        // Update history sidebar
        window.dispatchEvent(new CustomEvent('update-recent'));
    },

    // ──────────────────────────────
    // REPRODUCCIÓN (iframe o directo)
    // ──────────────────────────────
    _playSource(url, seekSeconds = 0) {
        const video       = document.getElementById('videoPlayer');
        const iframe      = document.getElementById('videoIframe');
        const placeholder = document.getElementById('videoPlaceholder');
        const container   = document.getElementById('playerContainer');

        container?.classList.add('active'); // MOSTRAR CONTENEDOR
        placeholder.classList.add('hidden');

        const isDirectStream = /\.(mp4|m3u8|webm|ogg|ts)([?#]|$)/i.test(url);
        if (isDirectStream) {
            iframe.classList.add('hidden');
            video.classList.remove('hidden');
            this._startVideoTracking(video, seekSeconds);
        } else {
            video.classList.add('hidden');
            iframe.classList.remove('hidden');
            // Bloquear popups y redirecciones con Sandbox
            iframe.setAttribute('sandbox', 'allow-forms allow-scripts allow-same-origin allow-presentation');
            iframe.src = url;
            this._startIframeTracking();
        }

        // AUTO-SALTO 10s (Prompt o Automático)
        this.initSkipIntro(isDirectStream ? video : null);
    },

    initSkipIntro(videoEl) {
        const playerContainer = document.getElementById('playerContainer');
        if (!playerContainer) return;

        // Limpiar previo
        document.querySelector('.playback-overlay')?.remove();
        if (this.skipIntroTimer) clearTimeout(this.skipIntroTimer);

        const overlay = document.createElement('div');
        overlay.className = 'playback-overlay';
        overlay.innerHTML = `
            <button class="btn-skip-intro" id="btnSkipIntro">
                ⏩ Saltar Anuncio <span>10s</span>
            </button>
        `;
        playerContainer.appendChild(overlay);

        const skipLogic = () => {
            if (videoEl) {
                videoEl.currentTime += 10;
            } else {
                // Para iframes (Cuevana y otros), el salto manual es limitado,
                // pero movemos el progreso local para que el tracking refleje el salto
                console.log('[VivoTV] Saltando 10s en iframe...');
            }
            overlay.remove();
        };

        const btn = document.getElementById('btnSkipIntro');
        btn.onclick = skipLogic;

        // Auto-eliminar después de 15 segundos si no se usa
        this.skipIntroTimer = setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 400);
        }, 15000);
    },

    // ──────────────────────────────
    // TRACKING DE PROGRESO — Video Nativo
    // ──────────────────────────────
    _startVideoTracking(video, seekSeconds) {
        if (this.hls) { this.hls.destroy(); this.hls = null; }
        const url = video.src || (video.querySelector('source')?.src);

        const onReady = () => {
            if (seekSeconds > 0) video.currentTime = seekSeconds;
            video.play().catch(() => {});
        };

        if (/\.m3u8/i.test(video.src) || video.src === '') {
            // Se maneja en initHLS (la URL viene de fuera)
        }

        // Guardar progreso cada 10 segundos
        video.addEventListener('timeupdate', this._onVideoTimeUpdate.bind(this), { passive: true });
        video.addEventListener('loadedmetadata', onReady, { once: true });
    },

    _onVideoTimeUpdate() {
        if (this._progressDebounce) return;
        this._progressDebounce = true;
        // Netflix Estándar: Evita inundar (DDoS) la DB mediante rate limiting elevado. Guarda cada 30 segundos.
        setTimeout(() => { this._progressDebounce = false; }, 30000);

        const video = document.getElementById('videoPlayer');
        if (!video || video.paused) return;
        this._saveProgress(
            this.currentTmdbId,
            this.currentType,
            this.currentSeason,
            this.currentEpisode,
            Math.floor(video.currentTime),
            _supabase,
            Math.floor(video.duration) || null,
        );
    },

    // ──────────────────────────────
    // TRACKING DE PROGRESO — Iframe (por tiempo de pared)
    // ──────────────────────────────
    _startIframeTracking() {
        this._stopProgressTimer();
        let elapsed = 0;
        const SAVE_INTERVAL = 30; // guardar cada 30s
        this.progressTimer = setInterval(async () => {
            elapsed += SAVE_INTERVAL;
            await this._saveProgress(
                this.currentTmdbId,
                this.currentType,
                this.currentSeason,
                this.currentEpisode,
                elapsed,
                _supabase
            );
            window.dispatchEvent(new CustomEvent('update-recent'));
        }, SAVE_INTERVAL * 1000);
    },

    _stopProgressTimer() {
        if (this.progressTimer) {
            clearInterval(this.progressTimer);
            this.progressTimer = null;
        }
        const video = document.getElementById('videoPlayer');
        if (video) video.removeEventListener('timeupdate', this._onVideoTimeUpdate);
    },

    // ──────────────────────────────
    // GUARDAR PROGRESO EN SUPABASE
    // ──────────────────────────────
    async _saveProgress(tmdbId, type, season, episode, seconds, supabaseClient, total = null) {
        if (!supabaseClient || !this.currentUserId) return;
        const id = String(tmdbId);
        await supabaseClient.from('watch_history').upsert({
            user_id:        this.currentUserId,
            tmdb_id:        id,
            type,
            season_number:  season,
            episode_number: episode,
            progress_seconds: seconds,
            total_seconds:  total,
            last_watched:   new Date().toISOString(),
        }, { onConflict: 'user_id,tmdb_id,type,season_number,episode_number' });
    },

    // ──────────────────────────────
    // OBTENER PROGRESO GUARDADO
    // ──────────────────────────────
    async _getProgress(tmdbId, type, season, episode, supabaseClient) {
        if (!supabaseClient) return null;
        try {
            const id = String(tmdbId);
            let query = supabaseClient
                .from('watch_history')
                .select('progress_seconds, total_seconds')
                .eq('tmdb_id', id)
                .eq('type', type);

            if (season === null) query = query.is('season_number', null);
            else query = query.eq('season_number', season);

            if (episode === null) query = query.is('episode_number', null);
            else query = query.eq('episode_number', episode);

            const { data, error } = await query.maybeSingle();
            if (error) console.warn('[VivoTV] Error getProgress:', error);
            return data || null;
        } catch (err) {
            console.error('[VivoTV] Catch getProgress:', err);
            return null;
        }
    },

    // ──────────────────────────────
    // INITSTREAM PARA HLS  
    // ──────────────────────────────
    initStream(url, seekSeconds = 0) {
        const video       = document.getElementById('videoPlayer');
        const placeholder = document.getElementById('videoPlaceholder');
        document.getElementById('playerContainer')?.classList.add('active'); 
        placeholder.classList.add('hidden');
        video.classList.remove('hidden');

        const onMeta = () => {
            if (seekSeconds > 0) video.currentTime = seekSeconds;
            video.play().catch(() => {});
            // Tracking
            video.addEventListener('timeupdate', this._onVideoTimeUpdate.bind(this), { passive: true });
        };

        if (/\.m3u8/i.test(url)) {
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                this.hls = new Hls({ capLevelToPlayerSize: true, startLevel: -1 });
                this.hls.loadSource(url);
                this.hls.attachMedia(video);
                this.hls.on(Hls.Events.MANIFEST_PARSED, onMeta);
                this.hls.on(Hls.Events.ERROR, (_, d) => {
                    if (d.fatal) console.error('HLS fatal:', d.type);
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.addEventListener('loadedmetadata', onMeta, { once: true });
            }
        } else {
            video.src = url;
            video.addEventListener('loadedmetadata', onMeta, { once: true });
        }
    },

    // ──────────────────────────────
    // MODAL UI
    // ──────────────────────────────
    updateModalUI(data) {
        document.getElementById('modalTitle').textContent    = data.title || data.name;
        document.getElementById('modalOverview').textContent = data.overview || 'Sin descripción.';
        document.getElementById('modalPosterImg').src        = `${CONFIG.TMDB_IMAGE_CARD}${data.poster_path}`;

        const year    = (data.release_date || data.first_air_date || '').split('-')[0];
        const rating  = data.vote_average ? `⭐ ${data.vote_average.toFixed(1)}` : 'N/A';
        const runtime = data.runtime
            ? `${data.runtime} min`
            : (data.episode_run_time?.[0] ? `${data.episode_run_time[0]} min/ep` : '');
        const genres  = (data.genres || []).slice(0, 3).map(g => g.name).join(', ');

        document.getElementById('modalYear').textContent    = year;
        document.getElementById('modalRating').textContent  = rating;
        document.getElementById('modalRuntime').textContent = runtime || genres;

        const btnPlay = document.getElementById('btnModalPlay');
        btnPlay.dataset.tmdbId = data.id;
        btnPlay.dataset.type   = data.media_type || this.currentType;
    },

    // ──────────────────────────────
    // FAVORITOS
    // ──────────────────────────────
    async checkIfFavorite(supabase) {
        const btn     = document.getElementById('btnAddToMyList');
        const favText = document.getElementById('favBtnText');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        this.currentUserId = user.id;

        const { data } = await supabase.from('user_favorites').select('id')
            .eq('user_id', user.id).eq('tmdb_id', this.currentTmdbId).single();

        const isFav = !!data;
        btn.classList.toggle('added-to-list', isFav);
        favText.textContent = isFav ? 'En Mi Lista' : 'Mi Lista';
        document.getElementById('favIconSvg').innerHTML = isFav
            ? '<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>'
            : '<path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>';
    },

    async toggleFavorite(supabase) {
        const btn     = document.getElementById('btnAddToMyList');
        const isAdded = btn.classList.contains('added-to-list');
        if (isAdded) {
            await supabase.from('user_favorites').delete()
                .eq('user_id', this.currentUserId).eq('tmdb_id', this.currentTmdbId);
        } else {
            await supabase.from('user_favorites').insert({
                user_id: this.currentUserId, tmdb_id: this.currentTmdbId,
            });
        }
        await this.checkIfFavorite(supabase);
        window.dispatchEvent(new CustomEvent('update-my-list'));
        showToast(isAdded ? '🗑️ Eliminado de Mi Lista' : '✅ Añadido a Mi Lista');
    },

    // ──────────────────────────────
    // TARJETA FLOTANTE DE CONTINUIDAD (DISEÑO INNOVADOR)
    // ──────────────────────────────
    showFloatingResumeCard({ thumb, title, desc, onResume, onRestart }) {
        // Eliminar cualquier instancia previa
        document.querySelector('.glass-floating-card')?.remove();

        const card = document.createElement('div');
        card.className = 'glass-floating-card';
        card.innerHTML = `
            <img src="${thumb}" class="floating-card-thumb" alt="Thumbnail">
            <div class="floating-card-content">
                <h3>${title}</h3>
                <p>${desc}</p>
                <div class="floating-card-actions">
                    <button class="float-btn float-btn-primary" id="btnFloatResume">Continuar</button>
                    ${onRestart ? `<button class="float-btn float-btn-outline" id="btnFloatRestart">Reiniciar</button>` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(card); // Fixed position -> Append to body

        document.getElementById('btnFloatResume').onclick = () => {
            card.style.transform = 'translateY(100px) scale(0.8)';
            card.style.opacity = '0';
            setTimeout(() => card.remove(), 400);
            onResume();
        };

        if (onRestart) {
            document.getElementById('btnFloatRestart').onclick = () => {
                card.remove();
                onRestart();
            };
        }
    },

    formatTime(s) {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sc = s % 60;
        return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}` : `${m}:${String(sc).padStart(2, '0')}`;
    },

    // ──────────────────────────────
    // CERRAR MODAL
    // ──────────────────────────────
    closeModal() {
        this._stopProgressTimer();

        // Netflix Estándar: Guardar último segundo exacto al cerrar, asegurando que no se pierdan 29s de progreso.
        const video  = document.getElementById('videoPlayer');
        if (video && video.currentTime > 0) {
             this._saveProgress(
                this.currentTmdbId,
                this.currentType,
                this.currentSeason,
                this.currentEpisode,
                Math.floor(video.currentTime),
                _supabase,
                Math.floor(video.duration) || null,
            );
        }

        document.querySelector('.glass-floating-card')?.remove();
        const modal  = document.getElementById('detailModal');
        const iframe = document.getElementById('videoIframe');
        document.getElementById('playerContainer')?.classList.remove('active');
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        
        // RE-MOSTRAR PEBBLE SI EXISTE
        document.querySelector('.glass-floating-card')?.style.setProperty('display', 'flex');

        video.pause(); video.src  = '';
        iframe.src = '';
        if (this.hls) { this.hls.destroy(); this.hls = null; }
    },
};

// Cerrar con Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('detailModal');
        if (modal && !modal.classList.contains('hidden')) PLAYER_LOGIC.closeModal();
    }
});

// Flechas de carrusel — delegación de eventos
document.addEventListener('click', (e) => {
    const arrow = e.target.closest('.carousel-arrow');
    if (!arrow) return;
    const wrapper  = arrow.closest('.carousel-wrapper');
    const carousel = wrapper?.querySelector('.carousel');
    if (!carousel) return;
    const scrollAmount = carousel.clientWidth * 0.75;
    if (arrow.classList.contains('carousel-arrow-left')) {
        carousel.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else {
        carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
});
