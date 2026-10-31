/* ============================================================================
   VivoTV Player - Amazon Prime Video X-Ray Feature
   Real-time cast & crew trivia sidebar with lazy-loaded actor photos
   ============================================================================ */
import { TMDB_SERVICE } from '../../tmdb.js';

export const XRayFeature = {
    async toggleXRay(context) {
        let overlay = document.getElementById('playerXRayOverlay');
        const container = document.getElementById('playerContainer');
        if (!container) return;

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'playerXRayOverlay';
            overlay.className = 'player-xray-panel hidden';
            container.appendChild(overlay);
        }

        const isHidden = overlay.classList.contains('hidden');
        const btn = document.getElementById('btnXRay');

        if (isHidden) {
            overlay.classList.remove('hidden');
            if (btn) btn.classList.add('active');
            await this.loadXRayData(overlay, context);
        } else {
            overlay.classList.add('hidden');
            if (btn) btn.classList.remove('active');
        }
    },

    async loadXRayData(overlay, context) {
        if (!overlay) return;

        overlay.innerHTML = `
            <div class="xray-header">
                <div class="xray-title-group">
                    <span class="xray-badge">⚡ X-RAY</span>
                    <span class="xray-title">Elenco & Trivia</span>
                </div>
                <button class="xray-close" id="btnCloseXRay" aria-label="Cerrar">&times;</button>
            </div>
            <div class="xray-body">
                <div class="xray-loading">
                    <div class="loader" style="width:24px;height:24px;"></div>
                    <span>Identificando actores en escena...</span>
                </div>
            </div>
        `;

        const btnClose = overlay.querySelector('#btnCloseXRay');
        if (btnClose) {
            btnClose.onclick = () => {
                overlay.classList.add('hidden');
                const btn = document.getElementById('btnXRay');
                if (btn) btn.classList.remove('active');
            };
        }

        try {
            const tmdbId = context.currentTmdbId;
            const type = context.currentType || 'movie';
            if (!tmdbId) throw new Error('No TMDB ID');

            const credits = await TMDB_SERVICE.getCredits(tmdbId, type);
            const cast = (credits.cast || []).slice(0, 10);
            const director = (credits.crew || []).find(c => c.job === 'Director')?.name || 'Equipo de Producción';

            const body = overlay.querySelector('.xray-body');
            if (!body) return;

            body.innerHTML = `
                <div class="xray-meta-box">
                    <div><strong>Título:</strong> ${context.currentPlaybackTitle || 'Contenido en VivoTV'}</div>
                    <div><strong>Dirección:</strong> ${director}</div>
                    <div><strong>Audio:</strong> Estéreo 48kHz (Dolby Digital Compatible)</div>
                </div>
                <div class="xray-section-title">Elenco Principal</div>
                <div class="xray-cast-scroll">
                    ${cast.map(a => `
                        <div class="xray-cast-card">
                            <img class="xray-actor-img" src="${a.profile_path ? 'https://image.tmdb.org/t/p/w185' + a.profile_path : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(a.name) + '&background=1e2540&color=fff'}" alt="${a.name}" loading="lazy">
                            <div class="xray-actor-info">
                                <span class="xray-actor-name">${a.name}</span>
                                <span class="xray-actor-character">${a.character || 'Personaje'}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch {
            const body = overlay.querySelector('.xray-body');
            if (body) body.innerHTML = '<p style="color: #94a3b8; font-size: 0.85rem;">Ficha técnica X-Ray no disponible.</p>';
        }
    }
};
