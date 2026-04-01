import { CONFIG } from './config.js';
import { TMDB_SERVICE } from './tmdb.js';
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
    seasonCache: {},
    lastSeriesProgress: null,
    progressTimer: null,

    async openDetail(tmdbId, type = 'movie', supabaseClient) {
        _supabase = supabaseClient;
        this.currentTmdbId = tmdbId;
        this.currentType = type;
        this.currentSeason = null;
        this.currentEpisode = null;
        this.seasonCache = {}; // Limpiar caché al abrir nuevo detalle
        this._stopProgressTimer();

        const modal = document.getElementById('detailModal');
        const mainContent = document.getElementById('modalMainContent');
        const playerContainer = document.getElementById('playerContainer');
        const videoPlayer = document.getElementById('videoPlayer');
        const videoIframe = document.getElementById('videoIframe');
        const seriesInfo = document.getElementById('seriesInfo');
        const trending = document.getElementById('trendingBadge');

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
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
            this.updateModalUI(details, credits);

            if (details.popularity > 500) trending.classList.remove('hidden');

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

    updateModalUI(data, credits = null) {
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
                const item = document.createElement('div');
                item.className = 'cast-item';
                const photo = actor.profile_path ? `${CONFIG.TMDB_IMAGE_CARD}${actor.profile_path}` : 'img/no-avatar.jpg';
                item.innerHTML = `
                    <img src="${photo}" class="cast-avatar" alt="${actor.name}" loading="lazy">
                    <span class="cast-name">${actor.name}</span>
                    <span class="cast-character">${actor.character}</span>
                `;
                castGrid.appendChild(item);
            });
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
        const { data, error } = await supabaseClient.from('video_sources').select('stream_url').eq('tmdb_id', String(tmdbId)).maybeSingle();
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
                title: 'Continuar Serie',
                desc: `T${p.season_number} E${p.episode_number} • ${this.formatTime(p.progress_seconds)}`,
                onResume: () => this.resumeLastEpisode(p.season_number, p.episode_number, p.progress_seconds, supabaseClient)
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

        // Si ya está en caché, renderizar de inmediato
        if (this.seasonCache[seasonNum]) {
            this._renderEpisodes(seasonNum, this.seasonCache[seasonNum], supabaseClient);
            return;
        }

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

            this.seasonCache[seasonNum] = episodes;
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
                    ${isWatched ? `<div class="ep-progress-bar"><div class="progress-fill" style="width: 100%"></div></div>` : ''}
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
        this._playSource(ep.stream_url, seekSeconds);
        // El guardado de progreso se iniciará automáticamente mediante el timer del reproductor
    },

    _playSource(url, seekSeconds = 0) {
        const video = document.getElementById('videoPlayer');
        const iframe = document.getElementById('videoIframe');
        const container = document.getElementById('playerContainer');
        const loader = document.getElementById('playerLoader');

        container.classList.remove('hidden');
        loader.classList.remove('hidden');
        const isDirectStream = /\.(mp4|m3u8|webm|ogg|ts)([?#]|$)/i.test(url);
        
        setTimeout(() => {
            loader.classList.add('hidden');
            if (isDirectStream) {
                iframe.classList.add('hidden');
                video.classList.remove('hidden');
                this._startVideoTracking(video, seekSeconds);
            } else {
                video.classList.add('hidden');
                iframe.classList.remove('hidden');
                // SEGURIDAD: Sandbox para prevenir redirecciones agresivas y anuncios intrusivos
                iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
                iframe.src = url;
                this._startIframeTracking();
            }
        }, 1000);
    },

    _startVideoTracking(video, seek) {
        if (seek > 0) video.currentTime = seek;
        video.play().catch(() => {});
        
        // Limpiamos listeners previos
        video.ontimeupdate = null;
        video.ontimeupdate = () => {
            const cur = Math.floor(video.currentTime);
            if (cur > 0 && cur % 15 === 0) { // Guardamos cada 15 segundos
                this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, cur, _supabase);
            }
        };
    },

    _startIframeTracking() {
        this._stopProgressTimer();
        let elapsed = 0;
        this.progressTimer = setInterval(() => {
            elapsed += 15;
            this._saveProgress(this.currentTmdbId, this.currentType, this.currentSeason, this.currentEpisode, elapsed, _supabase);
        }, 15000);
    },

    _stopProgressTimer() {
        if (this.progressTimer) clearInterval(this.progressTimer);
        this.progressTimer = null;
    },

    async _saveProgress(tmdbId, type, season, episode, seconds, supabaseClient) {
        if (!supabaseClient || !this.currentUserId) return;
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        await supabaseClient.from('watch_history').upsert({
            user_id: user.id,
            tmdb_id: String(tmdbId),
            type,
            season_number: season || 0,
            episode_number: episode || 0,
            progress_seconds: seconds,
            last_watched: new Date().toISOString()
        }, { onConflict: 'user_id,tmdb_id,type,season_number,episode_number' });
    },

    async _getProgress(tmdbId, type, season, episode, supabaseClient) {
        if (!supabaseClient || !this.currentUserId) return null;
        let query = supabaseClient.from('watch_history')
            .select('progress_seconds')
            .eq('user_id', this.currentUserId)
            .eq('tmdb_id', String(tmdbId))
            .eq('type', type)
            .eq('season_number', season || 0)
            .eq('episode_number', episode || 0);
        
        const { data } = await query.maybeSingle();
        return data;
    },

    async detectGlobalSeriesProgress(tmdbId, supabaseClient) {
        if (!this.currentUserId) return;
        const { data } = await supabaseClient.from('watch_history')
            .select('season_number, episode_number, progress_seconds')
            .eq('user_id', this.currentUserId)
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
        if (!user || !btn) return;

        this.currentUserId = user.id;
        const { data } = await supabase.from('user_favorites').select('id').eq('user_id', user.id).eq('tmdb_id', Number(this.currentTmdbId)).maybeSingle();
        
        btn.classList.toggle('added-to-list', !!data);
        const text = document.getElementById('favBtnText');
        if (text) text.textContent = !!data ? 'En Mi Lista' : 'Mi Lista';
    },

    async toggleFavorite(supabase) {
        const btn = document.getElementById('btnAddToMyList');
        const isAdded = btn.classList.contains('added-to-list');
        if (isAdded) {
            await supabase.from('user_favorites').delete().eq('user_id', this.currentUserId).eq('tmdb_id', Number(this.currentTmdbId));
        } else {
            // Removido 'type' para cumplir con el esquema actual de la base de datos
            await supabase.from('user_favorites').insert({ user_id: this.currentUserId, tmdb_id: Number(this.currentTmdbId) });
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
                    <span class="floating-badge">CONTINUAR</span>
                    <h3>${title}</h3>
                </div>
                <p>${desc}</p>
                <div class="floating-card-actions">
                    <button class="float-btn float-btn-primary" id="btnFloatResume">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        Reproducir
                    </button>
                    <button class="float-btn float-btn-close" id="btnFloatClose">&times;</button>
                </div>
            </div>
        `;
        document.body.appendChild(card);
        
        document.getElementById('btnFloatResume').onclick = () => { card.remove(); onResume(); };
        document.getElementById('btnFloatClose').onclick = () => { card.remove(); };
        
        // Auto-remove after 15s if not interacted
        setTimeout(() => card?.remove(), 15000);
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
        document.getElementById('detailModal').classList.add('hidden');
        document.getElementById('playerContainer').classList.add('hidden');
        document.getElementById('videoPlayer').pause();
        document.getElementById('videoIframe').src = '';
        document.body.style.overflow = '';
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') PLAYER_LOGIC.closeModal();
});
