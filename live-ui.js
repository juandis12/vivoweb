/**
 * live-ui.js — Controlador de Interfaz para Canales en Vivo
 */

import { LIVE_CHANNELS, getCurrentShow } from './live-engine.js';
import { supabase } from './config.js';
import { PLAYER_LOGIC } from './player.js';

let activeChannelId = 'action';

document.addEventListener('DOMContentLoaded', () => {
    renderChannelsList();
    switchChannel(activeChannelId);
    
    // Auto-actualizar cada minuto para verificar cambios de programa
    setInterval(() => {
        updateCurrentInfo();
    }, 60000);
});

// Soporte para cambios de página SPA
window.addEventListener('vivotv:page-changed', (e) => {
    if (e.detail.url.includes('live.html')) {
        renderChannelsList();
        switchChannel(activeChannelId);
    }
});

function renderChannelsList() {
    const list = document.getElementById('channelsList');
    if (!list) return;

    list.innerHTML = '';
    LIVE_CHANNELS.forEach(ch => {
        const item = document.createElement('div');
        item.className = `channel-item ${ch.id === activeChannelId ? 'active' : ''}`;
        item.style.setProperty('--ch-color', ch.color);
        item.innerHTML = `
            <div class="channel-icon">${ch.icon}</div>
            <div class="channel-meta">
                <span class="channel-name">${ch.name}</span>
                <span class="channel-now" id="now-${ch.id}">Cargando...</span>
            </div>
        `;
        item.onclick = () => switchChannel(ch.id);
        list.appendChild(item);
    });
    updateCurrentInfo();
}

async function switchChannel(id) {
    activeChannelId = id;
    
    // UI Feedback
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector(`.channel-item[onclick*="${id}"]`);
    if (activeEl) activeEl.classList.add('active');

    const status = getCurrentShow(id);
    if (!status) return;

    const { currentShow } = status;
    
    // Inyectar datos en el reproductor
    const placeholder = document.getElementById('livePlaceholder');
    const playerCont = document.getElementById('livePlayerContainer');
    const info = document.getElementById('liveInfo');

    placeholder.classList.remove('hidden');
    playerCont.classList.add('hidden');
    info.classList.add('hidden');

    try {
        // Buscar la fuente en la base de datos
        const { data } = await supabase
            .from('video_sources')
            .select('stream_url')
            .eq('tmdb_id', currentShow.tmdb_id)
            .maybeSingle();

        if (data?.stream_url) {
            // Usar lógica centralizada de reproducción con el offset calculado
            PLAYER_LOGIC._playSourceInElement(
                data.stream_url, 
                currentShow.offsetSeconds, 
                'liveVideoPlayer', 
                'liveVideoIframe'
            );
            
            placeholder.classList.add('hidden');
            playerCont.classList.remove('hidden');
            info.classList.remove('hidden');
            
            document.getElementById('liveTitle').textContent = currentShow.title;
            document.getElementById('liveNext').textContent = `A continuación: ${status.nextShow.title} (${status.nextShow.time})`;
        } else {
            document.getElementById('livePlaceholder').innerHTML = `<p>⚠️ Contenido no disponible en el servidor.</p>`;
        }
    } catch (e) {
        console.error('[Live] Error al sintonizar:', e);
    }
}

function updateCurrentInfo() {
    LIVE_CHANNELS.forEach(ch => {
        const status = getCurrentShow(ch.id);
        const el = document.getElementById(`now-${ch.id}`);
        if (el && status) {
            el.textContent = status.currentShow.title;
        }
    });

    // Si estamos viendo un canal, verificar si ya terminó para saltar al siguiente
    const currentStatus = getCurrentShow(activeChannelId);
    const titleEl = document.getElementById('liveTitle');
    if (titleEl && titleEl.textContent !== currentStatus.currentShow.title) {
        switchChannel(activeChannelId);
    }
}
