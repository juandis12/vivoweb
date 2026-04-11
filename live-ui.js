/**
 * live-ui.js — Controlador de Interfaz para Canales en Vivo (Simulcast)
 * REPARADO: Mejor compatibilidad de tipos y manejo de errores.
 */

import { LIVE_CHANNELS, getCurrentShow } from './live-engine.js';
import { supabase } from './config.js';
import { PLAYER_LOGIC } from './player.js';

let activeChannelId = 'action';
let updateInterval = null;
let filteredChannels = []; 

export const LIVE_UI = {
    async init() {
        console.log('[Live] Iniciando validación estricta...');
        
        try {
            // 1. Obtener IDs disponibles en video_sources (con manejo de errores)
            const { data: dbItems, error: dbError } = await supabase
                .from('video_sources')
                .select('tmdb_id');
            
            if (dbError) throw dbError;

            // Normalizar a Set de Strings para comparación rápida
            const availableSet = new Set((dbItems || []).map(item => String(item.tmdb_id)));
            console.log(`[Live] Disponibles en DB: ${availableSet.size} ítems.`);

            // 2. Filtrar Programación
            filteredChannels = LIVE_CHANNELS.map(ch => {
                const validSchedule = ch.schedule.filter(item => {
                    const isAvail = availableSet.has(String(item.tmdb_id));
                    return isAvail;
                });
                return { ...ch, schedule: validSchedule };
            }).filter(ch => ch.schedule.length > 0);

            console.log(`[Live] Canales tras filtrado: ${filteredChannels.length}`);

            const list = document.getElementById('channelsList');
            if (filteredChannels.length === 0) {
                if (list) list.innerHTML = `<div class="empty-state">
                    <div class="empty-icon">📺</div>
                    <h2>No hay canales listos</h2>
                    <p>Agregue contenido a la base de datos para habilitar la TV en vivo.</p>
                </div>`;
                return;
            }

            // 3. Renderizar Lista Inicial
            this.renderChannelsList();
            
            // 4. Sintonizar Primer Canal por defecto
            if (!filteredChannels.find(c => c.id === activeChannelId)) {
                activeChannelId = filteredChannels[0].id;
            }
            
            await this.switchChannel(activeChannelId);
            
            // 5. Configurar Intervalo de Sincronización
            if (updateInterval) clearInterval(updateInterval);
            updateInterval = setInterval(() => this.updateCurrentInfo(), 15000); // 15s para mayor precisión

        } catch (err) {
            console.error('[Live] Error Crítico en init:', err);
            const list = document.getElementById('channelsList');
            if (list) list.innerHTML = '<p class="error-msg">Error de conexión con la base de datos.</p>';
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
                    <span class="channel-now" id="now-${ch.id}" data-channel="${ch.id}">Actualizando...</span>
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
        
        console.log(`[Live] Intentando sintonizar: ${id}`);

        // Marcar UI activa
        document.querySelectorAll('.channel-item').forEach(el => {
            // Un chequeo más simple de clase activa
            const isTarget = el.querySelector('.channel-name')?.textContent.toLowerCase().includes(id.toLowerCase());
            el.classList.toggle('active', isTarget);
        });

        const channel = filteredChannels.find(c => c.id === id);
        if (!channel) return;

        const status = this.getFilteredShow(channel);
        if (!status || !status.currentShow) return;

        const { currentShow } = status;
        
        const placeholder = document.getElementById('livePlaceholder');
        const playerCont = document.getElementById('livePlayerContainer');
        const info = document.getElementById('liveInfo');

        if (placeholder) placeholder.classList.remove('hidden');
        if (playerCont) playerCont.classList.add('hidden');
        if (info) info.classList.add('hidden');

        try {
            const { data } = await supabase
                .from('video_sources')
                .select('stream_url')
                .eq('tmdb_id', Number(currentShow.tmdb_id))
                .maybeSingle();

            if (data?.stream_url) {
                console.log(`[Live] Fuente encontrada. Reproduciendo offset: ${currentShow.offsetSeconds}s`);
                
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
                    const titleEl = document.getElementById('liveTitle');
                    const nextEl = document.getElementById('liveNext');
                    if (titleEl) titleEl.textContent = currentShow.title;
                    if (nextEl) nextEl.textContent = `A continuación: ${status.nextShow.title} (${status.nextShow.time})`;
                }
            } else {
                console.error(`[Live] Sin fuente para TMDB: ${currentShow.tmdb_id}`);
                if (placeholder) placeholder.innerHTML = `<p style="padding:20px;">⚠️ Contenido "${currentShow.title}" no disponible.</p>`;
            }
        } catch (e) {
            console.error('[Live] Error en switchChannel:', e);
        }
    },

    getFilteredShow(channel) {
        if (!channel || !channel.schedule || channel.schedule.length === 0) return null;

        const now = new Date();
        const currentTimeInSeconds = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();

        let currentShow = channel.schedule[0];
        let nextShow = channel.schedule[1] || channel.schedule[0];

        for (let i = 0; i < channel.schedule.length; i++) {
            const item = channel.schedule[i];
            const [h, m] = item.time.split(':').map(Number);
            const showTimeSeconds = (h * 3600) + (m * 60);

            if (showTimeSeconds <= currentTimeInSeconds) {
                currentShow = item;
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
            if (el && status && status.currentShow) {
                el.textContent = status.currentShow.title;
            } else if (el) {
                el.textContent = 'Sin programación';
            }
        });

        // Auto-salto de programa si terminó el actual
        const activeCh = filteredChannels.find(c => c.id === activeChannelId);
        const currentStatus = this.getFilteredShow(activeCh);
        const titleEl = document.getElementById('liveTitle');
        
        if (titleEl && currentStatus && currentStatus.currentShow && titleEl.textContent !== currentStatus.currentShow.title) {
            console.log('[Live] Cambio de programa detectado automáticamente.');
            this.switchChannel(activeChannelId);
        }
    }
};

// Vinculación SPA
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
    setTimeout(() => LIVE_UI.init(), 200);
}
