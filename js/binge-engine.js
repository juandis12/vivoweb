/**
 * VIVOTV Binge Engine v1.0
 * Maneja lógica de Skip Intro, Next Episode y Marathon Mode.
 */

export const BingeEngine = {
    _activeTimestamps: null,
    _player: null,
    _isSkipIntroShown: false,
    _isNextEpShown: false,

    init(player) {
        this._player = player;
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
    async loadContentMetadata(tmdbId, type, season = null, episode = null) {
        this._reset();
        
        // Simulación de carga (En producción vendría de Supabase 'content_metadata')
        // Por defecto: Intro 0-90s, Créditos: últimos 30s
        this._activeTimestamps = {
            intro_start: 0,
            intro_end: 85,
            credits_start: 0.95, // Porcentaje si no hay tiempo fijo
        };

        console.log('[BingeEngine] 🍿 Metadatos cargados:', tmdbId);
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
        const creditsStart = duration * this._activeTimestamps.credits_start;
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
