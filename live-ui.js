/**
 * live-ui.js — Controlador de Interfaz para Canales en Vivo (Simulcast)
 * REPARADO: Sincronización Global Maestra (NTP-Style)
 */

import { LIVE_CHANNELS, getCurrentShow, buildLiveCatalog } from './live-engine.js';
import { supabase } from './config.js';
import { PLAYER_LOGIC } from './player.js';
import { DB_CATALOG, fetchAvailableIds } from './catalog.js';

let activeChannelId = 'action';
let updateInterval = null;
let filteredChannels = []; 
let serverOffset = 0; // Milisegundos de desfase vs servidor

export const LIVE_UI = {
    async init() {
        console.log('[Live] Iniciando Motor de Programación 24/7...');
        
        try {
            // 1. Fase de Calibración (NTP-Lite)
            await this.syncClock();

            // 1.1 Sincronización Forzada de Catálogo si está vacío
            let catalog = window.DB_CATALOG || [];
            if (catalog.length === 0) {
                console.log('[Live] Catálogo no detectado, forzando sincronización...');
                await fetchAvailableIds(supabase);
                catalog = window.DB_CATALOG || [];
            }
            
            // Reintento si sigue vacío (por latencia de red)
            if (catalog.length === 0) {
                await new Promise(resolve => {
                    const check = setInterval(() => {
                        catalog = window.DB_CATALOG || [];
                        if (catalog.length > 0) {
                            clearInterval(check);
                            resolve();
                        }
                    }, 1000);
                    setTimeout(() => { clearInterval(check); resolve(); }, 10000);
                });
            }

            // 2. Construir Catálogo Dinámico 24/7
            if (catalog.length === 0) {
                console.warn('[Live] No se detectaron títulos en el catálogo global tras la espera.');
            } else {
                console.log(`[Live] Generando parrilla con ${catalog.length} títulos de la biblioteca.`);
                await buildLiveCatalog(catalog);
            }

            // 3. Filtrar Canales Activos (solo los que tienen programación)
            filteredChannels = LIVE_CHANNELS.filter(ch => {
                const status = getCurrentShow(ch.id);
                return status !== null;
            });

            const list = document.getElementById('channelsList');
            if (filteredChannels.length === 0) {
                if (list) list.innerHTML = `<div class="empty-state"><h2>Próximamente</h2><p>Estamos preparando la señal.</p></div>`;
                return;
            }

            // 4. Render y Sintonía Internacional
            this.renderChannelsList();
            
            if (!filteredChannels.find(c => c.id === activeChannelId)) {
                activeChannelId = filteredChannels[0].id;
            }
            
            await this.switchChannel(activeChannelId);
            
            // 5. Configurar Intervalo Agresivo (Monitor Anti-Ads: cada 2s)
            if (updateInterval) clearInterval(updateInterval);
            updateInterval = setInterval(() => {
                this.updateCurrentInfo();
                this.checkSyncDrift(); // Vigilante activo Anti-Ads
            }, 2000); 

            // 6. Listener de Visibilidad (Auto-Resync al volver a la App)
            document.removeEventListener('visibilitychange', this.handleVisibility);
            document.addEventListener('visibilitychange', () => this.handleVisibility());

            // 7. Click para un-mute
            const shield = document.getElementById('livePlayerShield');
            if (shield) {
                shield.onclick = () => {
                    const video = document.querySelector('.active-tv-video');
                    if (video) {
                        video.muted = false;
                        const hint = document.getElementById('unmuteHint');
                        if (hint) hint.classList.add('hidden');
                        console.log('[Live] Audio activado por usuario.');
                    }
                };
            }

        } catch (err) {
            console.error('[Live] Error Crítico:', err);
        }
    },

    /**
     * AUTO-CORRECTOR: Verifica si el video se ha atrasado y lo obliga a saltar.
     */
    checkSyncDrift() {
        const video = document.querySelector('.active-tv-video');
        if (!video || video.paused || video.seeking) return;

        const channel = filteredChannels.find(c => c.id === activeChannelId);
        const status = this.getFilteredShow(channel);
        
        if (status?.currentShow) {
            // BUFFER ANTI-ADS: Siempre intentamos ir 10s adelante si estamos al puro inicio
            const adSkipBuffer = 10;
            const expected = status.currentShow.offsetSeconds + adSkipBuffer;
            const actual = video.currentTime;
            const diff = expected - actual;

            // Si el video se atrasa más de 3s (por un anuncio o buffering), saltamos.
            if (diff > 3) { 
                console.warn(`[Live] Monitor Anti-Ads: Detectado retraso de ${diff.toFixed(1)}s. Saltando publicidad...`);
                video.currentTime = expected;
                this.showSyncFlash('Anuncio Saltado / Sincronizando...');
            }
        }
    },

    showSyncFlash(text = 'Sincronización Global...') {
        let flash = document.querySelector('.sync-flash');
        if (!flash) {
            flash = document.createElement('div');
            flash.className = 'sync-flash';
            document.body.appendChild(flash);
        }
        flash.textContent = text;
        flash.classList.add('visible');
        setTimeout(() => flash.classList.remove('visible'), 2000);
    },

    /**
     * Sincroniza el reloj local con el servidor de Supabase
     */
    async syncClock() {
        try {
            const start = Date.now();
            // Intentamos obtener la hora del servidor vía cabecera HTTP
            const response = await fetch(supabase.supabaseUrl + '/rest/v1/', {
                method: 'HEAD',
                headers: { 'apikey': supabase.supabaseKey }
            });
            
            const end = Date.now();
            const serverDateStr = response.headers.get('date');
            
            if (serverDateStr) {
                const serverTime = new Date(serverDateStr).getTime();
                const rtt = end - start;
                const estimatedServerTime = serverTime + (rtt / 2);
                serverOffset = estimatedServerTime - end;
                console.log(`[Live] Calibración completa. Skew detectado: ${serverOffset}ms`);
            }
        } catch (e) {
            console.warn('[Live] No se pudo sincronizar el reloj con el servidor. Usando hora local.', e);
            serverOffset = 0;
        }
    },

    /**
     * Obtiene la hora actual "Corregida" según la sincronización global
     */
    getCorrectedNow() {
        return new Date(Date.now() + serverOffset);
    },

    handleVisibility() {
        if (document.visibilityState === 'visible') {
            console.log('[Live] Aplicación recuperada. Verificando sincronía global...');
            this.syncClock().then(() => {
                this.updateCurrentInfo();
                this.switchChannel(activeChannelId); // Re-sintonizar forzosamente para saltar al punto exacto
            });
        }
    },

    renderChannelsList() {
        const list = document.getElementById('channelsList');
        if (!list) return;

        list.innerHTML = '';
        filteredChannels.forEach(ch => {
            const item = document.createElement('div');
            item.className = `channel-item ${ch.id === activeChannelId ? 'active' : ''}`;
            item.style.setProperty('--ch-color', ch.color);
            item.innerHTML = `
                <div class="channel-icon">${ch.icon}</div>
                <div class="channel-meta">
                    <span class="channel-name">${ch.name}</span>
                    <span class="channel-now" id="now-${ch.id}">Actualizando...</span>
                </div>
            `;
            item.onclick = () => this.switchChannel(ch.id);
            list.appendChild(item);
        });
        this.updateCurrentInfo();
    },

    async switchChannel(id) {
        if (!id) return;
        activeChannelId = id;
        
        const channel = filteredChannels.find(c => c.id === id);
        if (!channel) return;

        const status = this.getFilteredShow(channel);
        if (!status || !status.currentShow) return;

        const { currentShow } = status;
        
        // UI Feedback
        document.querySelectorAll('.channel-item').forEach(el => {
            const name = el.querySelector('.channel-name')?.textContent;
            el.classList.toggle('active', name === channel.name);
        });

        const placeholder = document.getElementById('livePlaceholder');
        const playerCont = document.getElementById('livePlayerContainer');
        const info = document.getElementById('liveInfo');

        try {
            const { data } = await supabase
                .from('video_sources')
                .select('stream_url')
                .eq('tmdb_id', Number(currentShow.tmdb_id))
                .maybeSingle();

            if (data?.stream_url) {
                // LLAMADA CRITICA: Pasar offset exacto basado en RELOJ MAESTRO
                PLAYER_LOGIC._playSourceInElement(
                    data.stream_url, 
                    currentShow.offsetSeconds, 
                    'liveVideoPlayer', 
                    'liveVideoIframe'
                );
                
                if (placeholder) placeholder.classList.add('hidden');
                if (playerCont) playerCont.classList.remove('hidden');
                if (info) {
                    info.classList.remove('hidden');
                    document.getElementById('liveTitle').textContent = currentShow.title;
                    document.getElementById('liveNext').textContent = `A continuación: ${status.nextShow.title} (${status.nextShow.time})`;
                }
            }
        } catch (e) {
            console.error('[Live] Fallo en sintonía:', e);
        }
    },

    getFilteredShow(channel) {
        if (!channel) return null;

        // AQUÍ ESTÁ EL TRUCO: Usamos la hora corregida del Reloj Maestro
        const now = this.getCorrectedNow();
        // Usar la función de live-engine para obtener el show actual de la playlist dinámica
        return getCurrentShow(channel.id);
    },

    updateCurrentInfo() {
        if (!filteredChannels.length) return;

        filteredChannels.forEach(ch => {
            const status = this.getFilteredShow(ch);
            const el = document.getElementById(`now-${ch.id}`);
            if (el && status?.currentShow) {
                el.textContent = status.currentShow.title;
            }
        });

        // Auto-salto de programa
        const activeCh = filteredChannels.find(c => c.id === activeChannelId);
        const currentStatus = this.getFilteredShow(activeCh);
        const titleEl = document.getElementById('liveTitle');
        
        if (titleEl && currentStatus?.currentShow && titleEl.textContent !== currentStatus.currentShow.title) {
            console.log(`[Live] Cambio de programa detectado: ${titleEl.textContent} -> ${currentStatus.currentShow.title}`);
            this.switchChannel(activeChannelId);
        }
    }
};

window.addEventListener('vivotv:page-changed', (e) => {
    if (window.location.pathname.includes('live.html') || document.body.classList.contains('page-live')) {
        LIVE_UI.init();
    } else {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
    }
});

if (window.location.pathname.includes('live.html')) {
    setTimeout(() => LIVE_UI.init(), 100);
}
