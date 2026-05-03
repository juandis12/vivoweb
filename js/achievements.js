/**
 * VIVOTV Achievements Engine v1.0
 * Sistema de gamificación: XP, Niveles, Logros y Notificaciones
 */

const ACHIEVEMENTS = {
    first_play:     { id: 'first_play',     icon: '▶️',  title: 'Primera Función',     desc: 'Reproduciste tu primer video',           xp: 50,   secret: false },
    binge_3:        { id: 'binge_3',        icon: '🔥',  title: 'En Racha',            desc: 'Viste 3 episodios seguidos',             xp: 100,  secret: false },
    binge_10:       { id: 'binge_10',       icon: '💫',  title: 'Maratonista',         desc: 'Viste 10 episodios seguidos',            xp: 300,  secret: false },
    night_owl:      { id: 'night_owl',      icon: '🦉',  title: 'Búho Nocturno',       desc: 'Viste algo después de la medianoche',    xp: 75,   secret: true  },
    genre_hopper:   { id: 'genre_hopper',   icon: '🎭',  title: 'Sin Fronteras',       desc: 'Viste contenido de 5 géneros distintos', xp: 150,  secret: false },
    anime_fan:      { id: 'anime_fan',      icon: '🌸',  title: 'Otaku Certificado',   desc: 'Completaste 5 animes',                   xp: 200,  secret: false },
    explorer:       { id: 'explorer',       icon: '🗺️',  title: 'Explorador',          desc: 'Usaste el Vibe Engine por primera vez',  xp: 100,  secret: false },
    party_host:     { id: 'party_host',     icon: '🎉',  title: 'Anfitrión Perfecto',  desc: 'Creaste tu primera Watch Party',         xp: 150,  secret: false },
    cinephile_50:   { id: 'cinephile_50',   icon: '🎬',  title: 'Cinéfilo',            desc: 'Viste 50 películas',                     xp: 500,  secret: false },
    completionist:  { id: 'completionist',  icon: '✅',  title: 'Sin Pendientes',      desc: 'Marcaste 20 contenidos como vistos',     xp: 400,  secret: false },
    speed_watcher:  { id: 'speed_watcher',  icon: '⚡',  title: 'Speed Watcher',       desc: 'Viste una película en menos de 2h',      xp: 100,  secret: true  },
    legend:         { id: 'legend',         icon: '👑',  title: 'Leyenda de VIVOTV',   desc: 'Alcanzaste 2000 XP',                     xp: 0,    secret: false },
};

const XP_LEVELS = [
    { level: 1, title: 'Espectador',   min: 0    },
    { level: 2, title: 'Aficionado',   min: 200  },
    { level: 3, title: 'Cinéfilo',     min: 500  },
    { level: 4, title: 'Maratonista',  min: 1000 },
    { level: 5, title: 'Crítico',      min: 1500 },
    { level: 6, title: 'Leyenda',      min: 2000 },
];

const AchievementsEngine = {
    _state: { xp: 0, unlocked: [], stats: {} },
    _profileId: null,
    _supabase: null,

    async init(supabaseClient, profileId) {
        this._supabase = supabaseClient;
        this._profileId = profileId;
        await this._loadState();
        this._injectHUD();
        this._injectStyles();
        console.log('[Achievements] 🏆 Engine inicializado para perfil:', profileId);
    },

    async _loadState() {
        try {
            const { data } = await this._supabase
                .from('user_achievements')
                .select('xp, unlocked_ids, stats')
                .eq('profile_id', this._profileId)
                .maybeSingle();

            if (data) {
                this._state.xp = data.xp || 0;
                this._state.unlocked = data.unlocked_ids || [];
                this._state.stats = data.stats || {};
                console.log(`[Achievements] ✅ Datos cargados desde Cloud: ${this._state.xp} XP`);
            }
        } catch (e) {
            console.warn('[Achievements] Error al cargar estado, usando LocalStorage:', e);
            const cached = localStorage.getItem(`vivotv_achievements_${this._profileId}`);
            if (cached) this._state = JSON.parse(cached);
        }
    },

    async _saveState() {
        const payload = {
            profile_id: this._profileId,
            xp: this._state.xp,
            unlocked_ids: this._state.unlocked,
            stats: this._state.stats,
            updated_at: new Date().toISOString(),
        };
        try {
            const { error } = await this._supabase.from('user_achievements').upsert(payload, { onConflict: 'profile_id' });
            if (error) throw error;
            console.log('[Achievements] ☁️ Sincronización exitosa con la nube.');
        } catch (e) {
            console.warn('[Achievements] Falló sincronización con la nube, guardando localmente:', e);
            localStorage.setItem(`vivotv_achievements_${this._profileId}`, JSON.stringify(this._state));
        }
        this._refreshHUD();
    },

    // ── API pública — llamar desde player.js / app.js ──────────────────────────

    async track(event, payload = {}) {
        const s = this._state.stats;

        switch (event) {
            case 'play_video':
                s.plays = (s.plays || 0) + 1;
                s.genres = s.genres || [];
                if (payload.genre && !s.genres.includes(payload.genre)) s.genres.push(payload.genre);
                if (s.plays === 1) this._unlock('first_play');
                if ((s.genres || []).length >= 5) this._unlock('genre_hopper');
                if (payload.type === 'tv') {
                    s.episode_streak = (s.episode_streak || 0) + 1;
                    if (s.episode_streak >= 3)  this._unlock('binge_3');
                    if (s.episode_streak >= 10) this._unlock('binge_10');
                } else {
                    s.episode_streak = 0;
                }
                // Búho nocturno
                const hour = new Date().getHours();
                if (hour >= 0 && hour < 5) this._unlock('night_owl');
                break;

            case 'complete_content':
                s.completed = (s.completed || 0) + 1;
                if (payload.type === 'anime') {
                    s.anime_completed = (s.anime_completed || 0) + 1;
                    if (s.anime_completed >= 5) this._unlock('anime_fan');
                }
                if (payload.type === 'movie') {
                    s.movies_watched = (s.movies_watched || 0) + 1;
                    if (s.movies_watched >= 50) this._unlock('cinephile_50');
                }
                if (s.completed >= 20) this._unlock('completionist');
                break;

            case 'vibe_engine_used':
                this._unlock('explorer');
                break;

            case 'watch_party_created':
                this._unlock('party_host');
                break;
        }

        if (this._state.xp >= 2000) this._unlock('legend');
        await this._saveState();
    },

    _unlock(id) {
        if (this._state.unlocked.includes(id)) return;
        const ach = ACHIEVEMENTS[id];
        if (!ach) return;

        this._state.unlocked.push(id);
        this._state.xp += ach.xp;
        this._showToast(ach);
        console.log(`[Achievements] 🏆 Desbloqueado: ${ach.title} (+${ach.xp} XP)`);
    },

    _showToast(ach) {
        const toast = document.createElement('div');
        toast.className = 'ach-toast';
        toast.innerHTML = `
            <div class="ach-toast-icon">${ach.icon}</div>
            <div class="ach-toast-info">
                <span class="ach-toast-label">LOGRO DESBLOQUEADO</span>
                <span class="ach-toast-title">${ach.title}</span>
                <span class="ach-toast-xp">+${ach.xp} XP</span>
            </div>
        `;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    },

    // ── HUD (botón flotante + panel de logros) ─────────────────────────────────

    _injectHUD() {
        if (document.getElementById('achHudBtn')) return;

        // Botón HUD
        const btn = document.createElement('button');
        btn.id = 'achHudBtn';
        btn.title = 'Mis Logros';
        btn.innerHTML = `<span class="ach-hud-icon">🏆</span><span class="ach-hud-xp">0 XP</span>`;
        document.body.appendChild(btn);
        btn.onclick = () => this._togglePanel();

        // Panel
        const panel = document.createElement('div');
        panel.id = 'achPanel';
        panel.innerHTML = this._buildPanelHTML();
        document.body.appendChild(panel);

        this._refreshHUD();
    },

    _buildPanelHTML() {
        const allAchs = Object.values(ACHIEVEMENTS);
        const unlocked = this._state.unlocked;
        const level = this._getLevel();
        const nextLevel = XP_LEVELS[level.level] || null;
        const pct = nextLevel ? Math.min(100, ((this._state.xp - level.min) / (nextLevel.min - level.min)) * 100) : 100;

        const achHTML = allAchs.map(a => {
            const done = unlocked.includes(a.id);
            return `
                <div class="ach-item ${done ? 'done' : ''} ${a.secret && !done ? 'secret' : ''}">
                    <span class="ach-item-icon">${a.secret && !done ? '🔒' : a.icon}</span>
                    <div class="ach-item-info">
                        <span class="ach-item-title">${a.secret && !done ? '???' : a.title}</span>
                        <span class="ach-item-desc">${a.secret && !done ? 'Logro secreto' : a.desc}</span>
                    </div>
                    <span class="ach-item-xp">${done ? `✅` : `+${a.xp}`}</span>
                </div>
            `;
        }).join('');

        return `
            <div class="ach-panel-header">
                <span>🏆 Mis Logros</span>
                <button onclick="document.getElementById('achPanel').classList.remove('open')" class="ach-panel-close">✕</button>
            </div>
            <div class="ach-level-block">
                <div class="ach-level-title">Nivel ${level.level} — ${level.title}</div>
                <div class="ach-xp-bar"><div class="ach-xp-fill" style="width:${pct}%"></div></div>
                <div class="ach-xp-label">${this._state.xp} XP ${nextLevel ? `→ ${nextLevel.min} XP` : '(MÁXIMO)'}</div>
            </div>
            <div class="ach-list">${achHTML}</div>
        `;
    },

    _refreshHUD() {
        const btn = document.getElementById('achHudBtn');
        if (btn) {
            btn.querySelector('.ach-hud-xp').textContent = `${this._state.xp} XP`;
        }
        const panel = document.getElementById('achPanel');
        if (panel && panel.classList.contains('open')) {
            panel.innerHTML = this._buildPanelHTML();
        }
    },

    _togglePanel() {
        const panel = document.getElementById('achPanel');
        if (!panel) return;
        const isOpen = panel.classList.toggle('open');
        if (isOpen) panel.innerHTML = this._buildPanelHTML();
    },

    _getLevel() {
        const xp = this._state.xp;
        let current = XP_LEVELS[0];
        for (const l of XP_LEVELS) {
            if (xp >= l.min) current = l;
        }
        return current;
    },

    _injectStyles() {
        if (document.getElementById('achStyles')) return;
        const s = document.createElement('style');
        s.id = 'achStyles';
        s.textContent = `
            /* HUD Button */
            #achHudBtn {
                position: fixed; bottom: 180px; right: 30px; z-index: 1000;
                display: flex; align-items: center; gap: 8px;
                padding: 10px 16px; border-radius: 50px;
                background: linear-gradient(135deg, rgba(187,134,252,0.18), rgba(103,58,183,0.28));
                border: 1px solid rgba(187,134,252,0.35);
                color: white; font-family: 'Manrope', sans-serif;
                font-size: 0.82rem; font-weight: 700; cursor: pointer;
                backdrop-filter: blur(20px);
                box-shadow: 0 6px 24px rgba(187,134,252,0.18);
                transition: all 0.3s ease;
            }
            #achHudBtn:hover { transform: translateY(-2px); box-shadow: 0 10px 32px rgba(187,134,252,0.35); }
            .ach-hud-icon { font-size: 1.1rem; }

            /* Panel */
            #achPanel {
                position: fixed; right: -380px; top: 0; bottom: 0;
                width: 360px; z-index: 10001;
                background: linear-gradient(160deg, rgba(12,10,28,0.98), rgba(18,12,40,0.98));
                border-left: 1px solid rgba(187,134,252,0.2);
                backdrop-filter: blur(30px);
                padding: 24px 20px;
                overflow-y: auto;
                transition: right 0.4s cubic-bezier(0.23,1,0.32,1);
                font-family: 'Manrope', sans-serif;
            }
            #achPanel.open { right: 0; box-shadow: -20px 0 60px rgba(0,0,0,0.5); }

            .ach-panel-header {
                display: flex; justify-content: space-between; align-items: center;
                font-size: 1rem; font-weight: 800; color: white;
                margin-bottom: 20px; padding-bottom: 16px;
                border-bottom: 1px solid rgba(187,134,252,0.15);
            }
            .ach-panel-close {
                background: none; border: 1px solid rgba(255,255,255,0.1);
                color: rgba(255,255,255,0.5); border-radius: 50%;
                width: 30px; height: 30px; cursor: pointer; font-size: 0.85rem;
            }

            /* Level block */
            .ach-level-block { margin-bottom: 20px; }
            .ach-level-title { font-size: 0.9rem; font-weight: 800; color: #bb86fc; margin-bottom: 8px; }
            .ach-xp-bar {
                height: 6px; background: rgba(255,255,255,0.08);
                border-radius: 10px; overflow: hidden; margin-bottom: 6px;
            }
            .ach-xp-fill {
                height: 100%;
                background: linear-gradient(90deg, #bb86fc, #e040fb);
                border-radius: 10px;
                transition: width 0.8s cubic-bezier(0.23,1,0.32,1);
            }
            .ach-xp-label { font-size: 0.72rem; color: rgba(255,255,255,0.4); }

            /* Achievement items */
            .ach-list { display: flex; flex-direction: column; gap: 10px; }
            .ach-item {
                display: flex; align-items: center; gap: 12px;
                padding: 12px; border-radius: 12px;
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.06);
                transition: all 0.2s;
            }
            .ach-item.done {
                background: rgba(187,134,252,0.07);
                border-color: rgba(187,134,252,0.25);
            }
            .ach-item.secret { opacity: 0.4; }
            .ach-item-icon { font-size: 1.4rem; flex-shrink: 0; }
            .ach-item-info { flex: 1; }
            .ach-item-title {
                display: block; font-size: 0.82rem;
                font-weight: 800; color: white; margin-bottom: 2px;
            }
            .ach-item-desc { font-size: 0.7rem; color: rgba(255,255,255,0.4); }
            .ach-item-xp { font-size: 0.75rem; font-weight: 700; color: rgba(187,134,252,0.7); white-space: nowrap; }

            /* Toast */
            .ach-toast {
                position: fixed; bottom: 30px; left: 50%;
                transform: translateX(-50%) translateY(80px);
                z-index: 99999;
                display: flex; align-items: center; gap: 14px;
                padding: 14px 22px; border-radius: 16px;
                background: linear-gradient(135deg, rgba(15,10,30,0.97), rgba(25,15,50,0.97));
                border: 1px solid rgba(187,134,252,0.4);
                box-shadow: 0 20px 60px rgba(187,134,252,0.3), 0 0 0 1px rgba(255,255,255,0.05);
                backdrop-filter: blur(30px);
                font-family: 'Manrope', sans-serif;
                transition: transform 0.4s cubic-bezier(0.23,1,0.32,1), opacity 0.4s ease;
                opacity: 0;
            }
            .ach-toast.visible { transform: translateX(-50%) translateY(0); opacity: 1; }
            .ach-toast-icon { font-size: 2rem; }
            .ach-toast-info { display: flex; flex-direction: column; }
            .ach-toast-label { font-size: 0.65rem; font-weight: 900; letter-spacing: 2px; color: #bb86fc; }
            .ach-toast-title { font-size: 0.95rem; font-weight: 800; color: white; }
            .ach-toast-xp { font-size: 0.75rem; color: rgba(255,255,255,0.5); }
        `;
        document.head.appendChild(s);
    }
};

export { AchievementsEngine };
