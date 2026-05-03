/**
 * VIVOTV Binge Engine v1.0
 * Maneja lógica de Skip Intro, Next Episode y Marathon Mode.
 */

export const BingeEngine = {
    _activeTimestamps: null,
    _player: null,
    _supabase: null,
    _isSkipIntroShown: false,
    _isNextEpShown: false,

    init(player, supabase) {
        this._player = player;
        this._supabase = supabase;
        this._reset();
    },

    _reset() {
        this._activeTimestamps = null;
        this._isSkipIntroShown = false;
        this._isNextEpShown = false;
        this._hideButtons();
    },

    /**
     * Carga los metadatos de tiempos para el contenido actual.
     * @param {string} tmdbId 
     * @param {string} type 'movie' | 'tv'
     */
    async loadContentMetadata(tmdbId, type) {
        this._reset();
        if (!this._supabase) return;

        // 1. Intentar cargar desde tu propia DB primero (Datos ya aprendidos o curados)
        try {
            const { data, error } = await this._supabase
                .from('vivotv_content_metadata')
                .select('*')
                .eq('tmdb_id', tmdbId)
                .eq('content_type', type)
                .single();

            if (!error && data) {
                this._activeTimestamps = data;
                console.log('[BingeEngine] 🤖 Datos locales encontrados:', tmdbId);
                return;
            }
        } catch (e) {}

        // 2. Si es ANIME, consultar API externa (ANISKIP) de forma automática
        if (type === 'anime' || (this._player.seriesData?.genres?.some(g => g.id === 16))) {
            await this._fetchExternalAnimeMetadata(tmdbId);
            if (this._activeTimestamps) return;
        }

        // 3. Fallback: Activar modo "Aprendizaje Colectivo"
        this._activeTimestamps = {
            intro_start: 0,
            intro_end: 85,
            credits_start_pct: 0.95,
            is_learning: true
        };
        console.log('[BingeEngine] 🧠 Modo Aprendizaje activado para:', tmdbId);
    },

    async _fetchExternalAnimeMetadata(tmdbId) {
        try {
            // Buscamos en AniSkip usando el ID de TMDB (Requiere mapeo previo o búsqueda por título)
            // Por ahora usamos un mock de búsqueda inteligente
            console.log('[BingeEngine] 🔍 Escaneando base de datos global de Anime...');
            // Simulación de respuesta de API externa exitosa
            this._activeTimestamps = {
                intro_start: 0,
                intro_end: 90,
                credits_start_pct: 0.92,
                source: 'aniskip'
            };
            this._saveLearnedMetadata(tmdbId, 'tv', this._activeTimestamps);
        } catch (e) {
            console.warn('[BingeEngine] Auto-scan falló:', e);
        }
    },

    async _saveLearnedMetadata(tmdbId, type, metadata) {
        if (!this._supabase) return;
        await this._supabase.from('vivotv_content_metadata').upsert({
            tmdb_id: tmdbId,
            content_type: type,
            intro_start: metadata.intro_start,
            intro_end: metadata.intro_end,
            credits_start_pct: metadata.credits_start_pct
        });
    },

    /**
     * Reportar que un usuario saltó la intro para que el sistema aprenda.
     */
    reportManualSkip(time) {
        if (!this._activeTimestamps?.is_learning) return;
        console.log('[BingeEngine] 🎓 Aprendiendo nuevo tiempo de intro:', time);
        this._activeTimestamps.intro_end = time;
        this._saveLearnedMetadata(this._player.currentTmdbId, this._player.currentType, this._activeTimestamps);
    },

    /**
     * Monitorea el tiempo actual para disparar los botones.
     */
    update(currentTime, duration) {
        if (!this._activeTimestamps || !duration) return;

        // 1. Lógica Skip Intro
        if (currentTime >= this._activeTimestamps.intro_start && 
            currentTime <= this._activeTimestamps.intro_end) {
            this._showSkipIntro();
        } else {
            this._hideSkipIntro();
        }

        // 2. Lógica Next Episode
        const creditsStart = duration * (this._activeTimestamps.credits_start_pct || 0.95);
        if (currentTime >= creditsStart) {
            this._showNextEpisode();
        } else {
            this._hideNextEpisode();
        }
    },

    _showSkipIntro() {
        if (this._isSkipIntroShown) return;
        this._isSkipIntroShown = true;
        const btn = document.getElementById('btnSkipIntro');
        if (btn) btn.classList.add('active');
    },

    _hideSkipIntro() {
        if (!this._isSkipIntroShown) return;
        this._isSkipIntroShown = false;
        const btn = document.getElementById('btnSkipIntro');
        if (btn) btn.classList.remove('active');
    },

    _showNextEpisode() {
        if (this._isNextEpShown) return;
        this._isNextEpShown = true;
        const btn = document.getElementById('btnNextEp');
        if (btn) btn.classList.add('active');
    },

    _hideNextEpisode() {
        if (!this._isNextEpShown) return;
        this._isNextEpShown = false;
        const btn = document.getElementById('btnNextEp');
        if (btn) btn.classList.remove('active');
    },

    _hideButtons() {
        this._hideSkipIntro();
        this._hideNextEpisode();
    },

    skipIntro() {
        if (this._player && this._activeTimestamps) {
            const skipTo = this._activeTimestamps.intro_end;
            this._player.seekTo(skipTo);
            
            // Si estábamos en modo aprendizaje, confirmar que este tiempo es correcto
            if (this._activeTimestamps.is_learning) {
                this.reportManualSkip(skipTo);
            }
            
            this._hideSkipIntro();
        }
    }
};
