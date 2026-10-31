/**
 * VIVOTV Ambient FX & Liquid Motion Performance Engine v2.0
 * Conforme a Motion Foundations & Emil Design Engineering:
 * - Ambient Glow: Extrae paleta de colores del póster y tiñe el fondo
 * - 3D Tilt Cards: Efecto de profundidad cinemática en tarjetas
 * - Liquid Ripple & Tab Visibility Conservation (Ahorro de batería y 60 FPS)
 */

// ────────────────────────────────────────────────
// MÓDULO 1: AMBIENT GLOW
// ────────────────────────────────────────────────
const AmbientGlow = {
    _canvas: null,
    _ctx: null,
    _overlay: null,
    _lastColors: null,
    _rafId: null,

    init() {
        // Crear canvas de extracción off-screen
        this._canvas = document.createElement('canvas');
        this._canvas.width = 8;
        this._canvas.height = 12;
        this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });

        // Crear overlay de ambient light
        if (!document.getElementById('ambientGlowOverlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'ambientGlowOverlay';
            overlay.style.cssText = `
                position: fixed; inset: 0; pointer-events: none; z-index: 0;
                transition: background 2s cubic-bezier(0.23, 1, 0.32, 1);
                opacity: 0.35;
            `;
            document.body.prepend(overlay);
            this._overlay = overlay;
        } else {
            this._overlay = document.getElementById('ambientGlowOverlay');
        }

        // Observar cambios en el hero banner
        this._setupHeroObserver();
        console.log('[AmbientFX] ✨ Ambient Glow inicializado');
    },

    _setupHeroObserver() {
        const heroBanner = document.getElementById('heroBanner');
        if (!heroBanner) {
            setTimeout(() => this._setupHeroObserver(), 500);
            return;
        }

        const observer = new MutationObserver(() => {
            this._extractAndApply(heroBanner);
        });

        observer.observe(heroBanner, {
            attributes: true,
            attributeFilter: ['style']
        });

        this._extractAndApply(heroBanner);
    },

    _extractAndApply(element) {
        const style = element.style.backgroundImage;
        if (!style || style === 'none') return;

        const urlMatch = style.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (!urlMatch) return;

        const imageUrl = urlMatch[1];
        this._extractColors(imageUrl);
    },

    _extractColors(imageUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imageUrl.includes('?') ? `${imageUrl}&v=${Date.now()}` : `${imageUrl}?v=${Date.now()}`;
        img.onload = () => {
            try {
                this._ctx.drawImage(img, 0, 0, 8, 12);
                const data = this._ctx.getImageData(0, 0, 8, 12).data;

                const samples = [
                    [0, 0], [7, 0], [0, 11], [7, 11], [3, 5],
                    [1, 3], [6, 3], [3, 9]
                ];

                let r = 0, g = 0, b = 0, count = 0;
                samples.forEach(([sx, sy]) => {
                    const idx = (sy * 8 + sx) * 4;
                    const sr = data[idx], sg = data[idx + 1], sb = data[idx + 2];
                    const brightness = (sr + sg + sb) / 3;
                    if (brightness > 20 && brightness < 240) {
                        r += sr; g += sg; b += sb; count++;
                    }
                });

                if (count === 0) return;
                r = Math.round(r / count);
                g = Math.round(g / count);
                b = Math.round(b / count);

                if (this._overlay) {
                    this._overlay.style.background = `
                        radial-gradient(ellipse 90% 60% at 50% 10%, 
                            rgba(${r},${g},${b}, 0.5) 0%, 
                            rgba(${Math.round(r*0.4)},${Math.round(g*0.4)},${Math.round(b*0.4)}, 0.25) 50%, 
                            transparent 80%)
                    `;
                }
            } catch (e) {}
        };
    }
};

// ────────────────────────────────────────────────
// MÓDULO 2: 3D TILT CARDS
// ────────────────────────────────────────────────
const TiltCards = {
    init() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if ('ontouchstart' in window) return;

        document.addEventListener('mousemove', (e) => {
            const card = e.target.closest('.movie-card');
            if (!card) return;

            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;

            const rotX = -y * 8;
            const rotY = x * 8;

            card.style.transform = `perspective(600px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.15) translate3d(0, -6px, 0)`;
        }, { passive: true });

        document.addEventListener('mouseout', (e) => {
            const card = e.target.closest('.movie-card');
            if (!card) return;
            card.style.transform = '';
        }, { passive: true });
    }
};

// ────────────────────────────────────────────────
// MÓDULO 3: CINEMATIC MODAL & LIQUID UNVEIL
// ────────────────────────────────────────────────
const CinematicModal = {
    init() {
        document.addEventListener('click', (e) => {
            const card = e.target.closest('.movie-card');
            if (!card) return;
            const rect = card.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            this.triggerLiquidUnveil(cx, cy);
        });
    },

    triggerLiquidUnveil(cx, cy) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const ripple = document.createElement('div');
        ripple.style.cssText = `
            position: fixed; left: ${cx}px; top: ${cy}px;
            width: 10px; height: 10px; border-radius: 50%;
            background: radial-gradient(circle, rgba(187,134,252,0.4) 0%, rgba(124,58,237,0.2) 50%, transparent 70%);
            transform: translate(-50%, -50%);
            pointer-events: none; z-index: 9998;
            animation: cinematicRipple 0.6s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        `;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }
};

// ────────────────────────────────────────────────
// MÓDULO 4: LIQUID RIPPLE & TAB VISIBILITY CONSERVATION
// (Motion Foundations 60 FPS Rule Enforcement)
// ────────────────────────────────────────────────
const LiquidMotionEngine = {
    init() {
        // 1. Pausar animaciones en segundo plano para ahorrar batería y GPU
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                document.body.classList.add('tab-hidden');
            } else {
                document.body.classList.remove('tab-hidden');
            }
        });

        // 2. Ondas líquidas interactivas al hacer clic (zero layout shifts)
        document.addEventListener('pointerdown', (e) => {
            const target = e.target.closest('.btn, .btn-ver-mas, .genre-filter-chip, .mobile-category-pill, .btn-circle, .float-btn');
            if (!target) return;
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

            const rect = target.getBoundingClientRect();
            const ripple = document.createElement('span');
            ripple.className = 'liquid-ripple';
            ripple.style.left = `${e.clientX - rect.left}px`;
            ripple.style.top = `${e.clientY - rect.top}px`;

            target.appendChild(ripple);
            ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
        }, { passive: true });
    }
};

// ────────────────────────────────────────────────
// INICIALIZACIÓN GLOBAL
// ────────────────────────────────────────────────
function initAmbientFX() {
    if (!document.getElementById('ambientFxStyles')) {
        const style = document.createElement('style');
        style.id = 'ambientFxStyles';
        style.textContent = `
            @keyframes cinematicRipple {
                0%   { width: 0; height: 0; opacity: 1; transform: translate(-50%, -50%) scale(0); }
                100% { width: 650px; height: 650px; opacity: 0; transform: translate(-50%, -50%) scale(1); }
            }
            .movie-card {
                transform-style: preserve-3d;
                will-change: transform;
            }
            .movie-card-inner {
                backface-visibility: hidden;
            }
            #ambientGlowOverlay {
                mix-blend-mode: screen;
            }
        `;
        document.head.appendChild(style);
    }

    AmbientGlow.init();
    TiltCards.init();
    CinematicModal.init();
    LiquidMotionEngine.init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAmbientFX);
} else {
    initAmbientFX();
}

window.addEventListener('vivotv:page-changed', () => {
    AmbientGlow.init();
});

export { AmbientGlow, TiltCards, CinematicModal };
