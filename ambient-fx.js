/**
 * VIVOTV Ambient FX Engine v1.0
 * - Ambient Glow: Extrae paleta de colores del póster y tiñe el fondo de la app
 * - 3D Tilt Cards: Efecto de profundidad cinemática en tarjetas
 * - Cinematic Transition: Ripple de color al cambiar de contenido
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
        // MutationObserver para detectar cambio de imagen en el hero
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

        // Aplicar de inmediato si ya tiene imagen
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
        img.src = imageUrl;
        img.onload = () => {
            try {
                this._ctx.drawImage(img, 0, 0, 8, 12);
                const data = this._ctx.getImageData(0, 0, 8, 12).data;

                // Muestrear colores dominantes (esquinas + centro)
                const samples = [
                    [0, 0], [7, 0], [0, 11], [7, 11], [3, 5],
                    [1, 3], [6, 3], [3, 9]
                ];

                let r = 0, g = 0, b = 0, count = 0;
                samples.forEach(([sx, sy]) => {
                    const idx = (sy * 8 + sx) * 4;
                    const sr = data[idx], sg = data[idx + 1], sb = data[idx + 2];
                    // Ignorar colores muy oscuros o muy claros
                    const brightness = (sr + sg + sb) / 3;
                    if (brightness > 20 && brightness < 240) {
                        r += sr; g += sg; b += sb; count++;
                    }
                });

                if (count === 0) return;
                r = Math.floor(r / count);
                g = Math.floor(g / count);
                b = Math.floor(b / count);

                // Saturar y oscurecer para efecto "ambiental"
                const { h, s, l } = this._rgbToHsl(r, g, b);
                const saturatedColor = this._hslToRgb(h, Math.min(1, s * 1.8), 0.15);
                const accentColor = this._hslToRgb(h, Math.min(1, s * 2), 0.35);

                this._applyGlow(saturatedColor, accentColor, h);
            } catch (e) {
                // CORS - silencioso
            }
        };
    },

    _applyGlow({ r: r1, g: g1, b: b1 }, { r: r2, g: g2, b: b2 }, hue) {
        if (!this._overlay) return;

        // Gradiente radial que emana desde el hero hacia el contenido
        this._overlay.style.background = `
            radial-gradient(ellipse 120% 80% at 50% -10%, 
                rgba(${r2},${g2},${b2},0.6) 0%, 
                rgba(${r1},${g1},${b1},0.3) 40%, 
                transparent 70%),
            radial-gradient(ellipse 60% 40% at 80% 20%, 
                rgba(${r2},${g2},${b2},0.2) 0%, 
                transparent 60%)
        `;

        // Actualizar la variable CSS --ambient-hue para efectos en tarjetas
        document.documentElement.style.setProperty('--ambient-hue', hue);
        document.documentElement.style.setProperty('--ambient-r', r2);
        document.documentElement.style.setProperty('--ambient-g', g2);
        document.documentElement.style.setProperty('--ambient-b', b2);
    },

    _rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) { h = s = 0; }
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: h * 360, s, l };
    },

    _hslToRgb(h, s, l) {
        h /= 360;
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return {
            r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
            g: Math.round(hue2rgb(p, q, h) * 255),
            b: Math.round(hue2rgb(p, q, h - 1/3) * 255)
        };
    },

    // Llamar manualmente cuando se abre el modal de detalle
    applyFromPoster(posterUrl) {
        if (posterUrl) this._extractColors(posterUrl);
    }
};

// ────────────────────────────────────────────────
// MÓDULO 2: 3D TILT CARDS
// ────────────────────────────────────────────────
const TiltCards = {
    _activeCard: null,

    init() {
        // Usar delegación de eventos para cubrir tarjetas creadas dinámicamente
        document.addEventListener('mousemove', (e) => this._onMove(e), { passive: true });
        document.addEventListener('mouseleave', (e) => this._onLeave(e), true);
        console.log('[AmbientFX] 🎴 3D Tilt Cards inicializado');
    },

    _onMove(e) {
        const card = e.target.closest('.movie-card');
        if (!card) {
            if (this._activeCard) this._resetCard(this._activeCard);
            this._activeCard = null;
            return;
        }

        if (this._activeCard && this._activeCard !== card) {
            this._resetCard(this._activeCard);
        }
        this._activeCard = card;

        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width / 2);
        const dy = (e.clientY - cy) / (rect.height / 2);

        const rotX = -dy * 10; // max 10 deg
        const rotY = dx * 10;
        const shine = `radial-gradient(circle at ${(dx + 1) * 50}% ${(dy + 1) * 50}%, rgba(255,255,255,0.12) 0%, transparent 70%)`;

        card.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.04)`;
        card.style.transition = 'transform 0.1s ease-out, box-shadow 0.1s ease-out';
        card.style.boxShadow = `
            0 ${20 + Math.abs(dy) * 10}px ${40 + Math.abs(dx) * 15}px rgba(0,0,0,0.5),
            0 0 30px rgba(var(--ambient-r,187),var(--ambient-g,134),var(--ambient-b,252),0.3)
        `;

        // Efecto de brillo en el inner
        const inner = card.querySelector('.movie-card-inner') || card;
        inner.style.background = shine;
    },

    _onLeave(e) {
        const card = e.target.closest('.movie-card');
        if (card) this._resetCard(card);
    },

    _resetCard(card) {
        card.style.transform = '';
        card.style.transition = 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.4s ease';
        card.style.boxShadow = '';
        const inner = card.querySelector('.movie-card-inner') || card;
        inner.style.background = '';
    }
};

// ────────────────────────────────────────────────
// MÓDULO 3: CINEMATIC MODAL ENTRANCE
// ────────────────────────────────────────────────
const CinematicModal = {
    init() {
        // Escuchar cuando se abre el modal de detalle
        document.addEventListener('click', (e) => {
            const card = e.target.closest('.movie-card');
            if (!card) return;

            const posterImg = card.querySelector('img') || card;
            const bgUrl = posterImg.src || posterImg.style.backgroundImage;
            
            // Ripple de color expansivo desde el punto de click
            this._createRipple(e.clientX, e.clientY);
            
            // Extraer colores del póster clickeado
            if (bgUrl) AmbientGlow.applyFromPoster(bgUrl);
        });
        console.log('[AmbientFX] 🎬 Cinematic Modal inicializado');
    },

    _createRipple(x, y) {
        const ripple = document.createElement('div');
        ripple.style.cssText = `
            position: fixed;
            left: ${x}px; top: ${y}px;
            width: 0; height: 0;
            border-radius: 50%;
            background: radial-gradient(circle, 
                rgba(var(--ambient-r,187),var(--ambient-g,134),var(--ambient-b,252),0.2) 0%, 
                transparent 70%);
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 9998;
            animation: cinematicRipple 0.7s ease-out forwards;
        `;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 700);
    }
};

// ────────────────────────────────────────────────
// INICIALIZACIÓN
// ────────────────────────────────────────────────
function initAmbientFX() {
    // Agregar CSS de animaciones
    if (!document.getElementById('ambientFxStyles')) {
        const style = document.createElement('style');
        style.id = 'ambientFxStyles';
        style.textContent = `
            @keyframes cinematicRipple {
                0%   { width: 0; height: 0; opacity: 1; }
                100% { width: 600px; height: 600px; opacity: 0; }
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

            @media (prefers-reduced-motion: reduce) {
                .movie-card { transform: none !important; }
                #ambientGlowOverlay { display: none; }
            }
        `;
        document.head.appendChild(style);
    }

    AmbientGlow.init();
    TiltCards.init();
    CinematicModal.init();
}

// Auto-init cuando el DOM esté listo y al cambiar de página SPA
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAmbientFX);
} else {
    initAmbientFX();
}
window.addEventListener('vivotv:page-changed', () => {
    AmbientGlow.init();
});

export { AmbientGlow, TiltCards, CinematicModal };
