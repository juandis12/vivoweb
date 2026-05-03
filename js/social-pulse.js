/**
 * VIVOTV Social Pulse v1.0
 * Reacciones en tiempo real durante la reproducción — vía Supabase Realtime
 */

const REACTIONS = [
    { id: 'fire',  emoji: '🔥', label: 'Épico'    },
    { id: 'laugh', emoji: '😂', label: 'Gracioso'  },
    { id: 'sad',   emoji: '😢', label: 'Triste'    },
    { id: 'shock', emoji: '😱', label: 'Shock'     },
    { id: 'love',  emoji: '❤️', label: 'Amor'      },
    { id: 'mind',  emoji: '🤯', label: 'Impactante'},
];

const SocialPulse = {
    _channel: null,
    _supabase: null,
    _profileId: null,
    _tmdbId: null,
    _type: null,
    _isOpen: false,
    _isMinimized: false,
    _isDragging: false,
    _dragOffset: { x: 0, y: 0 },
    _emojiPool: [],      // Pool de emojis flotantes activos
    _lastReaction: 0,    // Throttle

    init(supabaseClient, profileId) {
        this._supabase = supabaseClient;
        this._profileId = profileId;
        this._injectUI();
        this._injectStyles();
        console.log('[SocialPulse] 💬 Inicializado para perfil:', profileId);
    },

    // Llamar cuando empieza a reproducirse un contenido
    attach(tmdbId, type) {
        this._tmdbId = tmdbId;
        this._type = type;
        this._subscribeRealtime();
        this._updateCounter();

        const el = document.getElementById('socialPulseBar');
        if (el) el.classList.add('visible');
    },

    detach() {
        if (this._channel) {
            this._supabase.removeChannel(this._channel);
            this._channel = null;
        }
        const el = document.getElementById('socialPulseBar');
        if (el) el.classList.remove('visible');
    },

    _subscribeRealtime() {
        if (this._channel) this._supabase.removeChannel(this._channel);

        // Escuchar reacciones en tiempo real de otros usuarios
        this._channel = this._supabase
            .channel(`social_pulse_${this._tmdbId}`)
            .on('broadcast', { event: 'reaction' }, ({ payload }) => {
                if (payload.profile_id !== this._profileId) {
                    // Reacción de otro usuario — mostrar emoji flotante
                    this._spawnFloatingEmoji(payload.emoji, true);
                    this._bumpCounter(payload.reaction_id);
                }
            })
            .subscribe();
    },

    async _sendReaction(reactionId) {
        // Throttle: máx 1 reacción por segundo
        const now = Date.now();
        if (now - this._lastReaction < 1000) return;
        this._lastReaction = now;

        const reaction = REACTIONS.find(r => r.id === reactionId);
        if (!reaction) return;

        // Mostrar localmente inmediato (optimistic UI)
        this._spawnFloatingEmoji(reaction.emoji, false);
        this._bumpCounter(reactionId);

        // Broadcast a otros usuarios
        if (this._channel) {
            this._channel.send({
                type: 'broadcast',
                event: 'reaction',
                payload: {
                    profile_id: this._profileId,
                    tmdb_id: this._tmdbId,
                    reaction_id: reactionId,
                    emoji: reaction.emoji,
                    ts: Date.now(),
                }
            });
        }

        // Guardar en DB para analytics (fire-and-forget)
        this._supabase.from('content_reactions').insert({
            profile_id: this._profileId,
            tmdb_id: this._tmdbId,
            type: this._type,
            reaction_id: reactionId,
            reacted_at: new Date().toISOString(),
        }).catch(() => {});
    },

    async _updateCounter() {
        try {
            const { count } = await this._supabase
                .from('content_reactions')
                .select('*', { count: 'exact', head: true })
                .eq('tmdb_id', this._tmdbId);

            const el = document.getElementById('spTotalReactions');
            if (el) el.textContent = `${count || 0} reacciones`;
        } catch (e) {}
    },

    _bumpCounter(reactionId) {
        const el = document.querySelector(`[data-sp-reaction="${reactionId}"] .sp-count`);
        if (!el) return;
        const n = parseInt(el.textContent || '0') + 1;
        el.textContent = n;
        el.parentElement?.classList.add('pulse');
        setTimeout(() => el.parentElement?.classList.remove('pulse'), 400);
    },

    _spawnFloatingEmoji(emoji, isOther) {
        const area = document.getElementById('spFloatArea');
        if (!area) return;

        const el = document.createElement('span');
        el.className = 'sp-float-emoji';
        el.textContent = emoji;
        el.style.left = `${10 + Math.random() * 80}%`;
        el.style.animationDuration = `${1.5 + Math.random() * 1.2}s`;
        if (isOther) el.style.opacity = '0.6';
        area.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    },

    _injectUI() {
        if (document.getElementById('socialPulseBar')) return;

        const bar = document.createElement('div');
        bar.id = 'socialPulseBar';
        bar.innerHTML = `
            <div id="spFloatArea"></div>
            <div class="sp-window">
                <div class="sp-header" id="spDragHandle">
                    <div class="sp-drag-indicator">
                        <span></span><span></span><span></span>
                    </div>
                    <div class="sp-controls">
                        <button class="sp-ctrl-btn" id="spBtnMinimize" title="Minimizar">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/></svg>
                        </button>
                        <button class="sp-ctrl-btn sp-ctrl-close" id="spBtnClose" title="Cerrar">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                    </div>
                </div>
                <div class="sp-inner">
                    <div class="sp-reactions-row">
                        ${REACTIONS.map(r => `
                            <button class="sp-reaction-btn" data-sp-reaction="${r.id}" title="${r.label}">
                                <span class="sp-emoji">${r.emoji}</span>
                                <span class="sp-count">0</span>
                            </button>
                        `).join('')}
                    </div>
                    <div class="sp-footer">
                        <span id="spTotalReactions" class="sp-total">0 reacciones</span>
                    </div>
                </div>
                <button id="spBtnExpand" class="sp-expand-pill">
                    <span class="sp-emoji">💬</span>
                    <span>Reacciones</span>
                </button>
            </div>
        `;
        document.body.appendChild(bar);

        // --- Lógica de Arrastre (Dragging) ---
        const handle = document.getElementById('spDragHandle');
        handle.onmousedown = (e) => {
            if (this._isMinimized) return;
            this._isDragging = true;
            this._dragOffset.x = e.clientX - bar.offsetLeft;
            this._dragOffset.y = e.clientY - bar.offsetTop;
            bar.classList.add('dragging');
        };

        document.onmousemove = (e) => {
            if (!this._isDragging) return;
            bar.style.left = `${e.clientX - this._dragOffset.x}px`;
            bar.style.top = `${e.clientY - this._dragOffset.y}px`;
            bar.style.bottom = 'auto';
            bar.style.transform = 'none';
        };

        document.onmouseup = () => {
            this._isDragging = false;
            bar.classList.remove('dragging');
        };

        // --- Lógica de Controles ---
        document.getElementById('spBtnMinimize').onclick = () => this.toggleMinimize(true);
        document.getElementById('spBtnExpand').onclick = () => this.toggleMinimize(false);
        document.getElementById('spBtnClose').onclick = () => this.detach();

        // Delegación de clicks de reacciones
        bar.addEventListener('click', e => {
            const btn = e.target.closest('.sp-reaction-btn');
            if (btn) this._sendReaction(btn.dataset.spReaction);
        });
    },

    toggleMinimize(val) {
        this._isMinimized = val;
        const bar = document.getElementById('socialPulseBar');
        if (bar) bar.classList.toggle('minimized', val);
    },

    _injectStyles() {
        if (document.getElementById('spStyles')) return;
        const s = document.createElement('style');
        s.id = 'spStyles';
        s.textContent = `
            #socialPulseBar {
                position: fixed;
                bottom: 30px; right: 30px;
                z-index: 11000;
                opacity: 0;
                transform: translateY(120px);
                transition: transform 0.4s cubic-bezier(0.23,1,0.32,1), opacity 0.4s ease, right 0.1s linear, top 0.1s linear;
                pointer-events: none;
            }
            #socialPulseBar.visible {
                transform: translateY(0);
                opacity: 1;
                pointer-events: auto;
            }
            #socialPulseBar.dragging { transition: none; opacity: 0.8; }
            
            .sp-window {
                position: relative;
                display: flex;
                flex-direction: column;
                background: linear-gradient(135deg, rgba(12,10,28,0.96), rgba(20,15,40,0.96));
                border: 1px solid rgba(187,134,252,0.25);
                border-radius: 16px;
                box-shadow: 0 20px 50px rgba(0,0,0,0.7);
                backdrop-filter: blur(24px);
                overflow: hidden;
            }

            .sp-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: rgba(255,255,255,0.03);
                border-bottom: 1px solid rgba(255,255,255,0.05);
                cursor: grab;
                user-select: none;
            }
            .sp-header:active { cursor: grabbing; }

            .sp-drag-indicator { display: flex; gap: 3px; }
            .sp-drag-indicator span { width: 4px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 50%; }

            .sp-controls { display: flex; gap: 6px; }
            .sp-ctrl-btn {
                background: rgba(255,255,255,0.08);
                border: none;
                color: white;
                width: 24px; height: 24px;
                border-radius: 6px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; transition: all 0.2s;
            }
            .sp-ctrl-btn:hover { background: rgba(255,255,255,0.15); }
            .sp-ctrl-close:hover { background: #ff4b4b; }

            .sp-inner {
                padding: 12px 16px;
                display: flex; flex-direction: column; align-items: center; gap: 8px;
                transition: all 0.3s ease;
            }

            /* Modo Minimizado */
            #socialPulseBar.minimized .sp-inner,
            #socialPulseBar.minimized .sp-header {
                display: none;
            }
            .sp-expand-pill {
                display: none;
                background: var(--vivotv-accent, #7B2FBE);
                color: white;
                border: none;
                padding: 10px 18px;
                border-radius: 30px;
                font-family: 'Manrope', sans-serif;
                font-weight: 800;
                font-size: 0.8rem;
                cursor: pointer;
                box-shadow: 0 10px 20px rgba(123,47,190,0.4);
                align-items: center; gap: 8px;
                animation: spPopIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            #socialPulseBar.minimized .sp-expand-pill { display: flex; }
            
            @keyframes spPopIn {
                from { transform: scale(0.5); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }

            .sp-footer { width: 100%; display: flex; justify-content: center; opacity: 0.5; }
            #spFloatArea {
                position: absolute;
                bottom: 100%;
                left: 0; right: 0;
                height: 200px;
                pointer-events: none;
                overflow: hidden;
            }
            .sp-inner {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                background: linear-gradient(135deg, rgba(12,10,28,0.92), rgba(20,15,40,0.92));
                border: 1px solid rgba(187,134,252,0.2);
                border-radius: 20px;
                padding: 10px 18px;
                backdrop-filter: blur(24px);
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            }
            .sp-reactions-row { display: flex; gap: 8px; align-items: center; }
            .sp-reaction-btn {
                display: flex; flex-direction: column; align-items: center;
                gap: 2px; padding: 8px 10px; border-radius: 12px;
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.07);
                cursor: pointer; transition: all 0.2s;
                font-family: 'Manrope', sans-serif;
                color: white;
            }
            .sp-reaction-btn:hover {
                background: rgba(187,134,252,0.12);
                border-color: rgba(187,134,252,0.35);
                transform: scale(1.15) translateY(-3px);
            }
            .sp-reaction-btn.pulse {
                animation: spPulse 0.35s ease;
            }
            @keyframes spPulse {
                0%,100% { transform: scale(1); }
                50%      { transform: scale(1.25); }
            }
            .sp-emoji { font-size: 1.3rem; }
            .sp-count { font-size: 0.65rem; color: rgba(255,255,255,0.45); font-weight: 700; }
            .sp-total { font-size: 0.65rem; color: rgba(255,255,255,0.3); font-family: 'Manrope', sans-serif; }

            /* Emojis flotantes */
            .sp-float-emoji {
                position: absolute;
                bottom: 0;
                font-size: 1.8rem;
                animation: spFloat linear forwards;
                pointer-events: none;
                user-select: none;
            }
            @keyframes spFloat {
                0%   { transform: translateY(0) scale(1); opacity: 1; }
                80%  { opacity: 1; }
                100% { transform: translateY(-180px) scale(0.6); opacity: 0; }
            }

            @media (max-width: 600px) {
                .sp-emoji { font-size: 1.1rem; }
                .sp-inner { padding: 8px 12px; }
            }
        `;
        document.head.appendChild(s);
    }
};

export { SocialPulse };
