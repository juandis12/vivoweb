/**
 * VIVOTV Vibe Engine v1.0
 * Motor de descubrimiento por estado de ánimo (Mood-Based Discovery)
 * Genera una playlist inmersiva y muestra una UI futurista de selección de vibras
 */

import { TMDB_SERVICE } from './tmdb.js';
import { CATALOG_UI } from './ui.js';
import { DB_CATALOG, availableIds } from './catalog.js';

// Mapa de vibras → géneros TMDB + keywords de búsqueda
const VIBE_MAP = {
    'adrenalina': {
        label: '⚡ Adrenalina Total',
        desc: 'Acción explosiva, persecuciones y héroes invencibles',
        color: '#ff4136',
        glow: 'rgba(255,65,54,0.4)',
        genres: [28, 53, 10752],
        emoji: '💥',
        mood: 'intense'
    },
    'melancolico': {
        label: '🌧 Noches de Lluvia',
        desc: 'Drama profundo, emociones a flor de piel',
        color: '#5856d6',
        glow: 'rgba(88,86,214,0.4)',
        genres: [18, 10749, 10402],
        emoji: '💜',
        mood: 'sad'
    },
    'reir': {
        label: '😂 Modo Carcajadas',
        desc: 'Comedias que te harán llorar de risa',
        color: '#ff9f0a',
        glow: 'rgba(255,159,10,0.4)',
        genres: [35, 10751, 16],
        emoji: '🤣',
        mood: 'happy'
    },
    'misterio': {
        label: '🔍 Mente Detectivesca',
        desc: 'Thrillers, giros de guion y misterios sin resolver',
        color: '#00b4d8',
        glow: 'rgba(0,180,216,0.4)',
        genres: [9648, 80, 53],
        emoji: '🕵️',
        mood: 'curious'
    },
    'terror': {
        label: '👻 No Puedo Mirar',
        desc: 'Terror que te hará dormir con la luz encendida',
        color: '#1a1a2e',
        glow: 'rgba(139,0,0,0.5)',
        genres: [27, 9648],
        emoji: '😱',
        mood: 'fear'
    },
    'epico': {
        label: '🏔 Épica Cinematográfica',
        desc: 'Mundos épicos, batallas legendarias y fantasía pura',
        color: '#ffd700',
        glow: 'rgba(255,215,0,0.35)',
        genres: [14, 12, 878, 10752],
        emoji: '⚔️',
        mood: 'epic'
    },
    'anime': {
        label: '🏮 Modo Otaku',
        desc: 'Los mejores animes del mundo',
        color: '#ff6b9d',
        glow: 'rgba(255,107,157,0.4)',
        genres: [16],
        emoji: '🌸',
        mood: 'anime'
    },
    'chill': {
        label: '☁️ Chill & Relax',
        desc: 'Para ver tranquilo sin drama, perfecta para fines de semana',
        color: '#34d399',
        glow: 'rgba(52,211,153,0.35)',
        genres: [35, 10751, 10770],
        emoji: '🌿',
        mood: 'chill'
    }
};

const VibeEngine = {
    _container: null,
    _isOpen: false,

    init() {
        this._injectUI();
        this._bindEvents();
        console.log('[VibeEngine] 🎭 Motor de Vibras inicializado');
    },

    _injectUI() {
        if (document.getElementById('vibeEngineContainer')) return;

        // Botón flotante de acceso rápido
        const btn = document.createElement('button');
        btn.id = 'vibeEngineBtn';
        btn.innerHTML = `
            <span class="vibe-btn-icon">🎭</span>
            <span class="vibe-btn-label">¿Cómo te sientes?</span>
        `;
        btn.title = 'Descubrimiento por Estado de Ánimo';
        document.body.appendChild(btn);

        // Panel principal
        const panel = document.createElement('div');
        panel.id = 'vibeEngineContainer';
        panel.innerHTML = this._buildPanelHTML();
        document.body.appendChild(panel);

        this._container = panel;

        // Estilos
        this._injectStyles();
    },

    _buildPanelHTML() {
        const vibeCards = Object.entries(VIBE_MAP).map(([key, vibe]) => `
            <button class="vibe-card" data-vibe="${key}" 
                    style="--vibe-color:${vibe.color}; --vibe-glow:${vibe.glow}">
                <span class="vibe-emoji">${vibe.emoji}</span>
                <span class="vibe-label">${vibe.label}</span>
                <span class="vibe-desc">${vibe.desc}</span>
                <div class="vibe-card-glow"></div>
            </button>
        `).join('');

        return `
            <div class="vibe-engine-overlay" id="vibeOverlay"></div>
            <div class="vibe-engine-panel glass-panel">
                <div class="vibe-header">
                    <div class="vibe-header-icon">🎭</div>
                    <div>
                        <h2 class="vibe-title">¿Cómo te sientes hoy?</h2>
                        <p class="vibe-subtitle">Elige tu vibra y VIVOTV crea tu experiencia perfecta</p>
                    </div>
                    <button class="vibe-close" id="vibeClose">✕</button>
                </div>
                <div class="vibe-grid">${vibeCards}</div>
                <div class="vibe-results-wrapper hidden" id="vibeResults">
                    <div class="vibe-results-header">
                        <span id="vibeResultsLabel">Resultados</span>
                        <button class="vibe-back-btn" id="vibeBack">← Cambiar vibra</button>
                    </div>
                    <div class="vibe-playlist" id="vibePlaylist"></div>
                </div>
            </div>
        `;
    },

    _injectStyles() {
        if (document.getElementById('vibeEngineStyles')) return;
        const style = document.createElement('style');
        style.id = 'vibeEngineStyles';
        style.textContent = `
            /* ── Botón Flotante ── */
            #vibeEngineBtn {
                position: fixed;
                bottom: 90px;
                right: 20px;
                z-index: 1000;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 18px;
                background: linear-gradient(135deg, rgba(187,134,252,0.2), rgba(103,58,183,0.3));
                border: 1px solid rgba(187,134,252,0.4);
                border-radius: 50px;
                color: white;
                font-family: 'Manrope', sans-serif;
                font-size: 0.85rem;
                font-weight: 700;
                cursor: pointer;
                backdrop-filter: blur(20px);
                box-shadow: 0 8px 32px rgba(187,134,252,0.2), 0 0 0 1px rgba(255,255,255,0.05);
                transition: all 0.3s ease;
                letter-spacing: 0.3px;
            }
            #vibeEngineBtn:hover {
                background: linear-gradient(135deg, rgba(187,134,252,0.35), rgba(103,58,183,0.5));
                box-shadow: 0 12px 40px rgba(187,134,252,0.4), 0 0 20px rgba(187,134,252,0.2);
                transform: translateY(-2px);
            }
            .vibe-btn-icon { font-size: 1.2rem; }

            /* ── Panel Principal ── */
            #vibeEngineContainer {
                position: fixed;
                inset: 0;
                z-index: 10000;
                display: none;
                align-items: center;
                justify-content: center;
            }
            #vibeEngineContainer.open { display: flex; }

            .vibe-engine-overlay {
                position: absolute;
                inset: 0;
                background: rgba(0,0,0,0.85);
                backdrop-filter: blur(10px);
            }

            .vibe-engine-panel {
                position: relative;
                z-index: 1;
                width: min(900px, 95vw);
                max-height: 90vh;
                overflow-y: auto;
                padding: 32px;
                border-radius: 24px;
                background: linear-gradient(145deg, rgba(15,15,30,0.97), rgba(20,15,45,0.97));
                border: 1px solid rgba(187,134,252,0.2);
                box-shadow: 0 40px 80px rgba(0,0,0,0.6), 0 0 60px rgba(187,134,252,0.1);
                animation: vibeSlideIn 0.4s cubic-bezier(0.23, 1, 0.32, 1);
            }

            @keyframes vibeSlideIn {
                from { transform: translateY(30px) scale(0.95); opacity: 0; }
                to   { transform: translateY(0) scale(1); opacity: 1; }
            }

            .vibe-header {
                display: flex;
                align-items: center;
                gap: 16px;
                margin-bottom: 28px;
                padding-bottom: 20px;
                border-bottom: 1px solid rgba(187,134,252,0.15);
            }
            .vibe-header-icon { font-size: 2.5rem; }
            .vibe-title {
                font-size: 1.5rem;
                font-weight: 900;
                background: linear-gradient(135deg, #bb86fc, #e040fb);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                margin: 0;
            }
            .vibe-subtitle {
                color: rgba(255,255,255,0.5);
                font-size: 0.85rem;
                margin: 4px 0 0;
            }
            .vibe-close {
                margin-left: auto;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                color: rgba(255,255,255,0.6);
                border-radius: 50%;
                width: 36px; height: 36px;
                cursor: pointer;
                font-size: 1rem;
                transition: all 0.2s;
                flex-shrink: 0;
            }
            .vibe-close:hover {
                background: rgba(255,65,54,0.2);
                border-color: rgba(255,65,54,0.4);
                color: white;
            }

            /* ── Grid de Vibras ── */
            .vibe-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                gap: 14px;
            }
            .vibe-card {
                position: relative;
                overflow: hidden;
                padding: 20px 16px;
                border-radius: 16px;
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.08);
                cursor: pointer;
                text-align: center;
                transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
                color: white;
                font-family: 'Manrope', sans-serif;
            }
            .vibe-card:hover, .vibe-card.active {
                background: rgba(var(--vibe-color),0.1);
                border-color: var(--vibe-color);
                transform: translateY(-4px) scale(1.03);
                box-shadow: 0 16px 40px var(--vibe-glow);
            }
            .vibe-card-glow {
                position: absolute;
                inset: -1px;
                border-radius: 16px;
                background: radial-gradient(circle at 50% 0%, var(--vibe-glow) 0%, transparent 70%);
                opacity: 0;
                transition: opacity 0.3s;
                pointer-events: none;
            }
            .vibe-card:hover .vibe-card-glow,
            .vibe-card.active .vibe-card-glow { opacity: 1; }
            .vibe-emoji { font-size: 2rem; display: block; margin-bottom: 8px; }
            .vibe-label {
                display: block;
                font-weight: 800;
                font-size: 0.9rem;
                margin-bottom: 6px;
                color: var(--vibe-color);
            }
            .vibe-desc {
                display: block;
                font-size: 0.72rem;
                color: rgba(255,255,255,0.45);
                line-height: 1.4;
            }

            /* ── Resultados ── */
            .vibe-results-wrapper { margin-top: 24px; }
            .vibe-results-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 16px;
            }
            #vibeResultsLabel {
                font-size: 1.1rem;
                font-weight: 800;
                color: white;
            }
            .vibe-back-btn {
                background: none;
                border: 1px solid rgba(187,134,252,0.3);
                color: rgba(187,134,252,0.8);
                padding: 6px 14px;
                border-radius: 50px;
                font-size: 0.8rem;
                cursor: pointer;
                transition: all 0.2s;
            }
            .vibe-back-btn:hover {
                background: rgba(187,134,252,0.1);
                color: white;
            }

            .vibe-playlist {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
                gap: 12px;
            }

            .vibe-loader {
                text-align: center;
                padding: 40px;
                color: rgba(255,255,255,0.4);
                font-size: 0.9rem;
            }
            .vibe-loader .vibe-spinner {
                width: 32px; height: 32px;
                border: 2px solid rgba(187,134,252,0.2);
                border-top-color: #bb86fc;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin: 0 auto 12px;
            }
            @keyframes spin { to { transform: rotate(360deg); } }

            @media (max-width: 600px) {
                .vibe-engine-panel { padding: 20px; }
                .vibe-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
                .vibe-card { padding: 14px 10px; }
                #vibeEngineBtn .vibe-btn-label { display: none; }
                #vibeEngineBtn { padding: 14px; border-radius: 50%; }
            }
        `;
        document.head.appendChild(style);
    },

    _bindEvents() {
        document.addEventListener('click', (e) => {
            if (e.target.id === 'vibeEngineBtn' || e.target.closest('#vibeEngineBtn')) {
                this.open();
                return;
            }
            if (e.target.id === 'vibeClose' || e.target.id === 'vibeOverlay') {
                this.close();
                return;
            }
            if (e.target.id === 'vibeBack') {
                this._showGrid();
                return;
            }

            const card = e.target.closest('.vibe-card');
            if (card) {
                this._selectVibe(card.dataset.vibe);
            }
        });
    },

    open() {
        const container = document.getElementById('vibeEngineContainer');
        if (container) {
            container.classList.add('open');
            this._isOpen = true;
            this._showGrid();
        }
    },

    close() {
        const container = document.getElementById('vibeEngineContainer');
        if (container) {
            container.classList.remove('open');
            this._isOpen = false;
        }
    },

    _showGrid() {
        const grid = document.querySelector('.vibe-grid');
        const results = document.getElementById('vibeResults');
        if (grid) grid.style.display = 'grid';
        if (results) results.classList.add('hidden');
        document.querySelectorAll('.vibe-card').forEach(c => c.classList.remove('active'));
    },

    async _selectVibe(vibeKey) {
        const vibe = VIBE_MAP[vibeKey];
        if (!vibe) return;

        // Feedback visual
        document.querySelectorAll('.vibe-card').forEach(c => c.classList.remove('active'));
        document.querySelector(`[data-vibe="${vibeKey}"]`)?.classList.add('active');

        // Actualizar overlay ambient con el color de la vibra
        const overlay = document.getElementById('ambientGlowOverlay');
        if (overlay) {
            const hex = vibe.color;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            overlay.style.background = `radial-gradient(ellipse 120% 80% at 50% -10%, rgba(${r},${g},${b},0.5) 0%, transparent 70%)`;
        }

        const grid = document.querySelector('.vibe-grid');
        const results = document.getElementById('vibeResults');
        const playlist = document.getElementById('vibePlaylist');
        const label = document.getElementById('vibeResultsLabel');

        if (!results || !playlist) return;

        if (grid) grid.style.display = 'none';
        results.classList.remove('hidden');
        if (label) label.innerHTML = `${vibe.emoji} ${vibe.label}`;

        playlist.innerHTML = `
            <div class="vibe-loader">
                <div class="vibe-spinner"></div>
                Buscando la playlist perfecta para tu vibra...
            </div>
        `;

        try {
            // Buscar en catálogo local primero
            const localCatalog = window.DB_CATALOG || [];
            const genreSet = new Set(vibe.genres);
            let results_items = localCatalog.filter(item => {
                const genres = item.genre_ids || [];
                return genres.some(g => genreSet.has(g)) &&
                       (window.availableIds || new Set()).has(item.id?.toString() || item.tmdb_id?.toString());
            }).slice(0, 20);

            // Si no hay suficiente en local, buscar en TMDB
            if (results_items.length < 6) {
                const promises = vibe.genres.slice(0, 2).map(genreId =>
                    TMDB_SERVICE.fetchFromTMDB('/discover/movie', { with_genres: genreId, sort_by: 'popularity.desc', page: 1 })
                        .then(r => r.results || [])
                        .catch(() => [])
                );
                const tmdbResults = (await Promise.all(promises)).flat();
                const seen = new Set(results_items.map(i => String(i.id)));
                tmdbResults.forEach(item => {
                    if (!seen.has(String(item.id))) {
                        results_items.push(item);
                        seen.add(String(item.id));
                    }
                });
                results_items = results_items.slice(0, 20);
            }

            playlist.innerHTML = '';
            if (results_items.length === 0) {
                playlist.innerHTML = `<p style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">No encontramos contenido para esta vibra aún.</p>`;
                return;
            }

            results_items.forEach(item => {
                const card = CATALOG_UI.createMovieCard(
                    item,
                    item.content_type === 'series' ? 'tv' : (item.first_air_date ? 'tv' : 'movie'),
                    true
                );
                playlist.appendChild(card);
            });

        } catch (e) {
            console.error('[VibeEngine] Error cargando resultados:', e);
            playlist.innerHTML = `<p style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">Error cargando el contenido. Intenta de nuevo.</p>`;
        }
    }
};

// Auto-inicializar (solo si el usuario está autenticado - esperar al evento de dashboard)
window.addEventListener('vivotv:page-changed', () => {
    setTimeout(() => VibeEngine.init(), 500);
});
window.addEventListener('vivotv:dashboard-ready', () => {
    setTimeout(() => VibeEngine.init(), 500);
});

// También intentar en DOMContentLoaded como fallback
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => VibeEngine.init(), 2000));
} else {
    setTimeout(() => VibeEngine.init(), 2000);
}

export { VibeEngine, VIBE_MAP };
