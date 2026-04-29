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
            <div class="sp-inner">
                <div class="sp-reactions-row">
                    ${REACTIONS.map(r => `
                        <button class="sp-reaction-btn" data-sp-reaction="${r.id}" title="${r.label}">
                            <span class="sp-emoji">${r.emoji}</span>
                            <span class="sp-count">0</span>
                        </button>
                    `).join('')}
                </div>
                <span id="spTotalReactions" class="sp-total">0 reacciones</span>
            </div>
        `;
        document.body.appendChild(bar);

        // Delegación de clicks
        bar.addEventListener('click', e => {
            const btn = e.target.closest('.sp-reaction-btn');
            if (btn) this._sendReaction(btn.dataset.spReaction);
        });
    },

    _injectStyles() {
        if (document.getElementById('spStyles')) return;
        const s = document.createElement('style');
        s.id = 'spStyles';
        s.textContent = `
            #socialPulseBar {
                position: fixed;
                bottom: 80px; left: 50%;
                transform: translateX(-50%) translateY(120px);
                z-index: 5000;
                opacity: 0;
                transition: transform 0.4s cubic-bezier(0.23,1,0.32,1), opacity 0.4s ease;
                pointer-events: none;
            }
            #socialPulseBar.visible {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
                pointer-events: auto;
            }
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
