/* ============================================================================
   VivoTV Player - Controls, Modals & Binge Navigation Module
   ============================================================================ */
import { getSupabase, getCurrentServers, setCurrentServers } from './state.js';
import { CONFIG } from '../config.js';
import { TMDB_SERVICE } from '../tmdb.js';
import { showToast } from '../utils.js';
import { CATALOG_UI } from '../ui.js';
import { StreamService } from '../services/StreamService.js';

export const controlMethods = {
async openDetail(tmdbId, type = 'movie', supabaseClient, availableIds = new Set()) {
        this._stopTrailer(); // Detener tráiler previo si existe
        this.availableIds = availableIds; // Guardar para uso en similares
        getSupabase() = supabaseClient;
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
        modal.classList.remove('is-playing-video');
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
                try {
                    this._stopTrailer();
                    // Asegurar SDKs antes de cualquier reproducción
                    await this._ensureVideoSDKs();

                    if (type === 'tv' || details.media_type === 'tv') {
                        // SI ES SERIE: BUSCAR ÚLTIMO VISTO O E1 PARA PLAY INMEDIATO
                        const targetEp = this.lastSeriesProgress || { season_number: 1, episode_number: 1 };
                        const { data: dbData } = await supabaseClient.from('series_episodes')
                            .select('stream_url, stream_url_vidsrc, stream_url_2embed, stream_url_superembed')
                            .eq('tmdb_id', Number(tmdbId))
                            .eq('season_number', targetEp.season_number)
                            .eq('episode_number', targetEp.episode_number)
                            .maybeSingle();

                        const isAnime = details.genres?.some(g => g.id === 16) && (details.original_language === 'ja' || details.origin_country?.includes('JP'));
                        const endpoint = isAnime ? 'anime' : 'serie';

                        let epData = dbData;
                        if (!epData) {
                            console.log(`[Player] Episodio no encontrado en Supabase. Autogenerando fallback para TMDB ${tmdbId} S${targetEp.season_number}E${targetEp.episode_number}...`);
                            epData = {
                                stream_url: `https://vimeus.com/e/${endpoint}?tmdb=${tmdbId}&se=${targetEp.season_number}&ep=${targetEp.episode_number}&view_key=${CONFIG.VIMEUS_VIEW_KEY}`,
                                stream_url_vidsrc: `https://vidsrc.xyz/embed/tv?tmdb=${tmdbId}&season=${targetEp.season_number}&episode=${targetEp.episode_number}`,
                                stream_url_2embed: `https://www.2embed.cc/embedtv/${tmdbId}&s=${targetEp.season_number}&e=${targetEp.episode_number}`,
                                stream_url_superembed: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${targetEp.season_number}&e=${targetEp.episode_number}`
                            };
                        } else {
                            // Rellenar campos faltantes
                            if (!epData.stream_url) epData.stream_url = `https://vimeus.com/e/${endpoint}?tmdb=${tmdbId}&se=${targetEp.season_number}&ep=${targetEp.episode_number}&view_key=${CONFIG.VIMEUS_VIEW_KEY}`;
                            if (!epData.stream_url_vidsrc) epData.stream_url_vidsrc = `https://vidsrc.xyz/embed/tv?tmdb=${tmdbId}&season=${targetEp.season_number}&episode=${targetEp.episode_number}`;
                            if (!epData.stream_url_2embed) epData.stream_url_2embed = `https://www.2embed.cc/embedtv/${tmdbId}&s=${targetEp.season_number}&e=${targetEp.episode_number}`;
                            if (!epData.stream_url_superembed) epData.stream_url_superembed = `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${targetEp.season_number}&e=${targetEp.episode_number}`;
                        }

                        this.currentSeason = targetEp.season_number;
                        this.currentEpisode = targetEp.episode_number;
                        await this._playEpisode(tmdbId, targetEp.season_number, epData, supabaseClient, targetEp.progress_seconds || 0);
                    } else {
                        await this._loadMovieSource(tmdbId, supabaseClient);
                    }
                } catch (err) {
                    console.error('[Player] Error al iniciar reproducción:', err);
                    showToast('Error al iniciar reproducción: ' + err.message, 'error');
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
                modal.classList.remove('is-playing-video');
                videoPlayer.pause();
                videoIframe.src = '';
                videoIframe.onload = null;
                this._stopProgressTimer();
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
            if (details.backdrop_path) {
                CATALOG_UI.applyAdaptiveTheme(`${CONFIG.TMDB_IMAGE_HERO}${details.backdrop_path}`);
            }

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

            const isAnime = this.seriesData?.genres?.some(g => g.id === 16) && (this.seriesData?.original_language === 'ja' || this.seriesData?.origin_country?.includes('JP'));
            const endpoint = isAnime ? 'anime' : 'serie';

            const episodes = (seasonData.episodes || []).map(ep => {
                const dbEp = (dbEps.data || []).find(d => d.episode_number === ep.episode_number);
                return { 
                    ...ep, 
                    stream_url: dbEp?.stream_url || `https://vimeus.com/e/${endpoint}?tmdb=${this.currentTmdbId}&se=${seasonNum}&ep=${ep.episode_number}&view_key=${CONFIG.VIMEUS_VIEW_KEY}`,
                    stream_url_vidsrc: dbEp?.stream_url_vidsrc || `https://vidsrc.xyz/embed/tv?tmdb=${this.currentTmdbId}&season=${seasonNum}&episode=${ep.episode_number}`,
                    stream_url_2embed: dbEp?.stream_url_2embed || `https://www.2embed.cc/embedtv/${this.currentTmdbId}&s=${seasonNum}&e=${ep.episode_number}`,
                    stream_url_superembed: dbEp?.stream_url_superembed || `https://multiembed.mov/?video_id=${this.currentTmdbId}&tmdb=1&s=${seasonNum}&e=${ep.episode_number}`
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
                .eq('type', 'tv')
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
                        // Intentar obtener duración real del episodio, o el promedio de la serie, o 45m
                        const runtime = ep.runtime || (this.seriesData?.episode_run_time?.[0]) || 45;
                        const totalSecs = runtime * 60;
                        const isFullyWatched = prog.progress_seconds > (totalSecs * 0.85); // Fase Precision: 85%
                        
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

// UI: Selector de Servidores
    showServerSelector(servers, seek = 0) {
        setCurrentServers(servers);
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
            const server = getCurrentServers()[index];
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

formatTime(s) {
        if (!s) return '00:00';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sc = s % 60;
        return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}` : `${m}:${String(sc).padStart(2, '0')}`;
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

async resumeLastEpisode(seasonNum, epNum, seekSecs, supabaseClient) {
        // En lugar de navegar el DOM, pedimos el stream_url directo para reproducir de inmediato
        const { data: dbData } = await supabaseClient.from('series_episodes')
            .select('stream_url, stream_url_vidsrc, stream_url_2embed, stream_url_superembed')
            .eq('tmdb_id', String(this.currentTmdbId))
            .eq('season_number', seasonNum)
            .eq('episode_number', epNum)
            .maybeSingle();

        const isAnime = this.seriesData?.genres?.some(g => g.id === 16) && (this.seriesData?.original_language === 'ja' || this.seriesData?.origin_country?.includes('JP'));
        const endpoint = isAnime ? 'anime' : 'serie';

        let epData = dbData;
        if (!epData) {
            epData = {
                stream_url: `https://vimeus.com/e/${endpoint}?tmdb=${this.currentTmdbId}&se=${seasonNum}&ep=${epNum}&view_key=${CONFIG.VIMEUS_VIEW_KEY}`,
                stream_url_vidsrc: `https://vidsrc.xyz/embed/tv?tmdb=${this.currentTmdbId}&season=${seasonNum}&episode=${epNum}`,
                stream_url_2embed: `https://www.2embed.cc/embedtv/${this.currentTmdbId}&s=${seasonNum}&e=${epNum}`,
                stream_url_superembed: `https://multiembed.mov/?video_id=${this.currentTmdbId}&tmdb=1&s=${seasonNum}&e=${epNum}`
            };
        } else {
            if (!epData.stream_url) epData.stream_url = `https://vimeus.com/e/${endpoint}?tmdb=${this.currentTmdbId}&se=${seasonNum}&ep=${epNum}&view_key=${CONFIG.VIMEUS_VIEW_KEY}`;
            if (!epData.stream_url_vidsrc) epData.stream_url_vidsrc = `https://vidsrc.xyz/embed/tv?tmdb=${this.currentTmdbId}&season=${seasonNum}&episode=${epNum}`;
            if (!epData.stream_url_2embed) epData.stream_url_2embed = `https://www.2embed.cc/embedtv/${this.currentTmdbId}&s=${seasonNum}&e=${epNum}`;
            if (!epData.stream_url_superembed) epData.stream_url_superembed = `https://multiembed.mov/?video_id=${this.currentTmdbId}&tmdb=1&s=${seasonNum}&e=${epNum}`;
        }

        this.currentSeason = seasonNum;
        this.currentEpisode = epNum;
        this._playEpisode(this.currentTmdbId, seasonNum, epData, supabaseClient, seekSecs);
        // También movemos la pestaña de temporada en el modal para UI coherente
        const pills = document.getElementById('seasonsPills');
        if (pills) {
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

closeModal() {
        console.log('[Player] Cerrando modal, salvando progreso...');
        if (window.SOCIAL_PULSE) window.SOCIAL_PULSE.detach();
        this.forceSaveCurrentProgress();
        this._stopProgressTimer();
        this._stopTrailer();
        this._cancelMarathon();
        const dModalClose = document.getElementById('detailModal');
        if (dModalClose) {
            dModalClose.classList.add('hidden');
            dModalClose.classList.remove('is-playing-video');
        }
        document.getElementById('playerContainer').classList.add('hidden');
        document.getElementById('serverSelector')?.classList.remove('visible');
        document.getElementById('videoPlayer').pause();
        const iframe = document.getElementById('videoIframe');
        if (iframe) {
            iframe.src = '';
            iframe.onload = null;
        }
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

async _getNextEpisode() {
        if (!this.currentTmdbId || !this.currentSeason || !this.currentEpisode) return null;
        
        // Buscar el siguiente episodio en la base de datos (Fase Marathon PRO)
        const { data: nextData } = await getSupabase().from('series_episodes')
            .select('season_number, episode_number, stream_url, stream_url_vidsrc, stream_url_2embed, stream_url_superembed')
            .eq('tmdb_id', Number(this.currentTmdbId))
            .or(`and(season_number.eq.${this.currentSeason},episode_number.gt.${this.currentEpisode}),season_number.gt.${this.currentSeason}`)
            .order('season_number', { ascending: true })
            .order('episode_number', { ascending: true })
            .limit(1)
            .maybeSingle();

        const isAnime = this.seriesData?.genres?.some(g => g.id === 16) && (this.seriesData?.original_language === 'ja' || this.seriesData?.origin_country?.includes('JP'));
        const endpoint = isAnime ? 'anime' : 'serie';

        if (nextData && nextData.stream_url) {
            if (!nextData.stream_url_vidsrc) nextData.stream_url_vidsrc = `https://vidsrc.xyz/embed/tv?tmdb=${this.currentTmdbId}&season=${nextData.season_number}&episode=${nextData.episode_number}`;
            if (!nextData.stream_url_2embed) nextData.stream_url_2embed = `https://www.2embed.cc/embedtv/${this.currentTmdbId}&s=${nextData.season_number}&e=${nextData.episode_number}`;
            if (!nextData.stream_url_superembed) nextData.stream_url_superembed = `https://multiembed.mov/?video_id=${this.currentTmdbId}&tmdb=1&s=${nextData.season_number}&e=${nextData.episode_number}`;
            return {
                season: nextData.season_number,
                data: nextData
            };
        } else if (this.seriesData) {
            const currentSeasonNum = Number(this.currentSeason);
            const currentEpNum = Number(this.currentEpisode);
            const seasons = this.seriesData.seasons || [];
            const currentSeasonMeta = seasons.find(s => s.season_number === currentSeasonNum);

            if (currentSeasonMeta) {
                let nextSeasonNum = currentSeasonNum;
                let nextEpNum = currentEpNum + 1;

                if (nextEpNum > currentSeasonMeta.episode_count) {
                    nextSeasonNum = currentSeasonNum + 1;
                    nextEpNum = 1;
                }

                const nextSeasonMeta = seasons.find(s => s.season_number === nextSeasonNum);
                if (nextSeasonMeta && nextEpNum <= nextSeasonMeta.episode_count) {
                    const autogeneratedData = {
                        season_number: nextSeasonNum,
                        episode_number: nextEpNum,
                        stream_url: `https://vimeus.com/e/${endpoint}?tmdb=${this.currentTmdbId}&se=${nextSeasonNum}&ep=${nextEpNum}&view_key=${CONFIG.VIMEUS_VIEW_KEY}`,
                        stream_url_vidsrc: `https://vidsrc.xyz/embed/tv?tmdb=${this.currentTmdbId}&season=${nextSeasonNum}&episode=${nextEpNum}`,
                        stream_url_2embed: `https://www.2embed.cc/embedtv/${this.currentTmdbId}&s=${nextSeasonNum}&e=${nextEpNum}`,
                        stream_url_superembed: `https://multiembed.mov/?video_id=${this.currentTmdbId}&tmdb=1&s=${nextSeasonNum}&e=${nextEpNum}`
                    };
                    return {
                        season: nextSeasonNum,
                        data: autogeneratedData
                    };
                }
            }
        }
        return null;
    },

async playNextEpisode() {
        await this.playNextEpisodeFrom(this.currentSeason, this.currentEpisode, getSupabase());
    },

async playNextEpisodeFrom(seasonNum, epNum, supabase) {
        // Buscar el siguiente episodio en la base de datos
        const { data: dbData } = await supabase.from('series_episodes')
            .select('season_number, episode_number, stream_url, stream_url_vidsrc, stream_url_2embed, stream_url_superembed')
            .eq('tmdb_id', Number(this.currentTmdbId))
            .or(`and(season_number.eq.${seasonNum},episode_number.gt.${epNum}),season_number.gt.${seasonNum}`)
            .order('season_number', { ascending: true })
            .order('episode_number', { ascending: true })
            .limit(1)
            .maybeSingle();

        const isAnime = this.seriesData?.genres?.some(g => g.id === 16) && (this.seriesData?.original_language === 'ja' || this.seriesData?.origin_country?.includes('JP'));
        const endpoint = isAnime ? 'anime' : 'serie';

        let nextEp = null;

        if (dbData && dbData.stream_url) {
            if (!dbData.stream_url_vidsrc) dbData.stream_url_vidsrc = `https://vidsrc.xyz/embed/tv?tmdb=${this.currentTmdbId}&season=${dbData.season_number}&episode=${dbData.episode_number}`;
            if (!dbData.stream_url_2embed) dbData.stream_url_2embed = `https://www.2embed.cc/embedtv/${this.currentTmdbId}&s=${dbData.season_number}&e=${dbData.episode_number}`;
            if (!dbData.stream_url_superembed) dbData.stream_url_superembed = `https://multiembed.mov/?video_id=${this.currentTmdbId}&tmdb=1&s=${dbData.season_number}&e=${dbData.episode_number}`;
            nextEp = dbData;
        } else if (this.seriesData) {
            const currentSeasonNum = Number(seasonNum);
            const currentEpNum = Number(epNum);
            const seasons = this.seriesData.seasons || [];
            const currentSeasonMeta = seasons.find(s => s.season_number === currentSeasonNum);

            if (currentSeasonMeta) {
                let nextSeasonNum = currentSeasonNum;
                let nextEpNum = currentEpNum + 1;

                if (nextEpNum > currentSeasonMeta.episode_count) {
                    nextSeasonNum = currentSeasonNum + 1;
                    nextEpNum = 1;
                }

                const nextSeasonMeta = seasons.find(s => s.season_number === nextSeasonNum);
                if (nextSeasonMeta && nextEpNum <= nextSeasonMeta.episode_count) {
                    nextEp = {
                        season_number: nextSeasonNum,
                        episode_number: nextEpNum,
                        stream_url: `https://vimeus.com/e/${endpoint}?tmdb=${this.currentTmdbId}&se=${nextSeasonNum}&ep=${nextEpNum}&view_key=${CONFIG.VIMEUS_VIEW_KEY}`,
                        stream_url_vidsrc: `https://vidsrc.xyz/embed/tv?tmdb=${this.currentTmdbId}&season=${nextSeasonNum}&episode=${nextEpNum}`,
                        stream_url_2embed: `https://www.2embed.cc/embedtv/${this.currentTmdbId}&s=${nextSeasonNum}&e=${nextEpNum}`,
                        stream_url_superembed: `https://multiembed.mov/?video_id=${this.currentTmdbId}&tmdb=1&s=${nextSeasonNum}&e=${nextEpNum}`
                    };
                }
            }
        }

        if (nextEp) {
            this.currentSeason = nextEp.season_number;
            this.currentEpisode = nextEp.episode_number;
            this._playEpisode(this.currentTmdbId, nextEp.season_number, nextEp, supabase, 0);
            
            // Actualizar UI del modal en segundo plano si está abierto
            this.switchSeason(nextEp.season_number, supabase);
        } else {
            showToast('Has llegado al final de los episodios disponibles.');
            this._hideNextEpisodeButton();
        }
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

/**
     * Muestra tarjeta de siguiente episodio (estilo Netflix / Disney+)
     */
    _showNextEpisodePrompt(nextEp) {
        if (!nextEp) return;
        if (typeof this._showMarathonCountdown === 'function') {
            this._showMarathonCountdown(nextEp, getSupabase());
        }
    }
};
