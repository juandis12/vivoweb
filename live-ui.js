/**
 * live-ui.js — Controlador de Interfaz para Canales en Vivo (Simulcast)
 * REPARADO: Sincronización Global Maestra (NTP-Style)
 */

import { LIVE_CHANNELS, getCurrentShow } from './live-engine.js';
import { supabase } from './config.js';
import { PLAYER_LOGIC } from './player.js';

let activeChannelId = 'action';
let updateInterval = null;
let filteredChannels = []; 
let serverOffset = 0; // Milisegundos de desfase vs servidor

export const LIVE_UI = {
    async init() {
        console.log('[Live] Calibrando Reloj Maestro...');
        
        try {
            // 1. Fase de Calibración (NTP-Lite)
            await this.syncClock();

            // 2. Obtener IDs disponibles en video_sources
            const { data: dbItems, error: dbError } = await supabase
                .from('video_sources')
                .select('tmdb_id');
            
            if (dbError) throw dbError;

            const availableSet = new Set((dbItems || []).map(item => String(item.tmdb_id)));
            console.log(`[Live] Disponibles en DB: ${availableSet.size}. Desfase Reloj: ${serverOffset}ms`);

            // 3. Filtrar Programación
            filteredChannels = LIVE_CHANNELS.map(ch => {
                const validSchedule = ch.schedule.filter(item => availableSet.has(String(item.tmdb_id)));
                return { ...ch, schedule: validSchedule };
            }).filter(ch => ch.schedule.length > 0);

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
            updateInterval = setInterval(() => this.updateCurrentInfo(), 10000); 

            // 6. Listener de Visibilidad (Auto-Resync al volver a la App)
            document.removeEventListener('visibilitychange', this.handleVisibility);
            document.addEventListener('visibilitychange', () => this.handleVisibility());

        } catch (err) {
            console.error('[Live] Error Crítico:', err);
        }
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
        if (!channel || !channel.schedule || channel.schedule.length === 0) return null;

        // AQUÍ ESTÁ EL TRUCO: Usamos la hora corregida del Reloj Maestro
        const now = this.getCorrectedNow();
        const currentTimeInSeconds = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();

        let currentShow = channel.schedule[0];
        let nextShow = channel.schedule[1] || channel.schedule[0];

        for (let i = 0; i < channel.schedule.length; i++) {
            const item = channel.schedule[i];
            const [h, m] = item.time.split(':').map(Number);
            const showTimeSeconds = (h * 3600) + (m * 60);

            if (showTimeSeconds <= currentTimeInSeconds) {
                currentShow = { ...item };
                nextShow = channel.schedule[i+1] || channel.schedule[0];
                currentShow.offsetSeconds = currentTimeInSeconds - showTimeSeconds;
            } else {
                break;
            }
        }
        return { currentShow, nextShow };
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
