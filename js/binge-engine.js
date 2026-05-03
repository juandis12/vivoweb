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

        try {
            const { data, error } = await this._supabase
                .from('vivotv_content_metadata')
                .select('*')
                .eq('tmdb_id', tmdbId)
                .eq('content_type', type)
                .single();

            if (!error && data) {
                this._activeTimestamps = data;
                console.log('[BingeEngine] ✅ Metadatos reales cargados:', tmdbId);
            } else {
                // Fallback a valores genéricos si no hay metadata específica
                this._activeTimestamps = {
                    intro_start: 0,
                    intro_end: 85,
                    credits_start_pct: 0.95
                };
                console.log('[BingeEngine] 💡 Usando valores genéricos para:', tmdbId);
            }
        } catch (e) {
            console.warn('[BingeEngine] Error cargando metadata:', e);
        }
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
            this._player.seekTo(this._activeTimestamps.intro_end);
            this._hideSkipIntro();
        }
    }
};
