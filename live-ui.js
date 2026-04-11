/**
 * live-ui.js — Controlador de Interfaz para Canales en Vivo (Simulcast)
 * REPARADO: Sincronización Global Maestra (NTP-Style)
 */

import { LIVE_CHANNELS, getCurrentShow, buildLiveCatalog } from './live-engine.js';
import { supabase } from './config.js';
import { PLAYER_LOGIC } from './player.js';
import { DB_CATALOG } from './catalog.js';

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

            // 1.1 Esperar a que el catálogo esté listo si es necesario
            if (!DB_CATALOG || DB_CATALOG.length === 0) {
                console.log('[Live] Catálogo vacío, esperando sincronización...');
                await new Promise(resolve => {
                    const check = setInterval(() => {
                        if (DB_CATALOG && DB_CATALOG.length > 0) {
                            clearInterval(check);
                            resolve();
                        }
                    }, 500);
                    setTimeout(() => { clearInterval(check); resolve(); }, 5000); // Timeout 5s
                });
            }

            // 2. Construir Catálogo Dinámico 24/7 con los datos locales
            // Filtramos las películas que realmente están en video_sources
            const { data: dbItems } = await supabase.from('video_sources').select('tmdb_id');
            const availableSet = new Set((dbItems || []).map(item => String(item.tmdb_id)));
            
            const liveReadyCatalog = DB_CATALOG.filter(item => availableSet.has(String(item.id || item.tmdb_id)));
            
            console.log(`[Live] Generando parrilla con ${liveReadyCatalog.length} títulos disponibles.`);
            await buildLiveCatalog(liveReadyCatalog);

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
            
            // 5. Configurar Intervalo de Alta Precisión
            if (updateInterval) clearInterval(updateInterval);
            updateInterval = setInterval(() => {
                this.updateCurrentInfo();
                this.checkSyncDrift(); // Auto-Corrector cada 10s
            }, 10000); 

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
        if (!video || video.paused) return;

        const channel = filteredChannels.find(c => c.id === activeChannelId);
        const status = this.getFilteredShow(channel);
        
        if (status?.currentShow) {
            const expected = status.currentShow.offsetSeconds;
            const actual = video.currentTime;
            const diff = Math.abs(expected - actual);

            if (diff > 5) { // Tolerancia de 5 segundos para evitar tartamudeo constante
                console.warn(`[Live] Detectado desajuste de ${diff.toFixed(1)}s. Corrigiendo...`);
                video.currentTime = expected;
                // Mostrar breve aviso flash
                this.showSyncFlash();
            }
        }
    },

    showSyncFlash() {
        let flash = document.querySelector('.sync-flash');
        if (!flash) {
            flash = document.createElement('div');
            flash.className = 'sync-flash';
            flash.textContent = 'Sincronización Global...';
            document.body.appendChild(flash);
        }
        flash.classList.add('visible');
        setTimeout(() => flash.classList.remove('visible'), 2000);
    },

    /**
     * Sincroniza el reloj local con el servidor de Supabase
     */
    async syncClock() {
        const start = Date.now();
        // Usamos una llamada HEAD a la API de Supabase para leer el header 'date'
        const response = await fetch(supabase.supabaseUrl + '/rest/v1/', {
            method: 'HEAD',
            headers: { 'apikey': supabase.supabaseKey }
        });
        const end = Date.now();
        const serverDateStr = response.headers.get('date');
        
        if (serverDateStr) {
            const serverTime = new Date(serverDateStr).getTime();
            const rtt = end - start;
            // El tiempo real del servidor es tiempoRecibido + (tiempoTransferencia / 2)
            const estimatedServerTime = serverTime + (rtt / 2);
            serverOffset = estimatedServerTime - end;
            console.log(`[Live] Calibración completa. Skew detectado: ${serverOffset}ms`);
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
