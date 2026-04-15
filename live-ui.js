/**
 * live-ui.js — Controlador de Interfaz para Canales en Vivo
 */

import { LIVE_CHANNELS, getCurrentShow } from './live-engine.js';
import { supabase } from './config.js';
import { PLAYER_LOGIC } from './player.js';

let activeChannelId = 'action';
let streamsCache = {};

document.addEventListener('DOMContentLoaded', () => {
    initLive();
});

// Soporte para cambios de página SPA
window.addEventListener('vivotv:page-changed', (e) => {
    if (e.detail.url.includes('live.html')) {
        initLive();
    }
});

async function initLive() {
    renderChannelsList();
    await preloadStreams();
    switchChannel(activeChannelId);
    
    // Configurar EPG
    const btnOpen = document.getElementById('btnOpenEPG');
    const btnClose = document.getElementById('btnCloseEPG');
    const modal = document.getElementById('epgModal');

    if (btnOpen) btnOpen.onclick = () => {
        renderEPG();
        modal.classList.remove('hidden');
    };
    if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');

    // Auto-actualizar cada 15 segundos para mayor precisión en barras de progreso
    if (window.liveInterval) clearInterval(window.liveInterval);
    window.liveInterval = setInterval(() => {
        updateCurrentInfo();
    }, 15000);
}

function renderEPG() {
    const grid = document.getElementById('epgGrid');
    if (!grid) return;

    grid.innerHTML = '';
    LIVE_CHANNELS.forEach(ch => {
        const col = document.createElement('div');
        col.className = 'epg-channel-col';
        
        const currentShowInfo = getCurrentShow(ch.id);
        
        col.innerHTML = `
            <div class="epg-channel-header">
                <div class="channel-icon" style="width:40px; height:40px; font-size:1.2rem; background:${ch.color}">${ch.icon}</div>
                <span class="channel-name" style="font-size:0.9rem">${ch.name}</span>
            </div>
            <div class="epg-shows">
                ${ch.schedule.map(show => {
                    const isActive = currentShowInfo?.currentShow.time === show.time;
                    return `
                        <div class="epg-show-item ${isActive ? 'active' : ''}">
                            <span class="epg-time">${show.time}</span>
                            <span class="epg-name">${show.title}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        grid.appendChild(col);
    });
}


async function preloadStreams() {
    console.log('[Live] Pre-cargando fuentes de canales...');
    const tmdbIds = LIVE_CHANNELS.flatMap(ch => ch.schedule.map(s => s.tmdb_id));
    const uniqueIds = [...new Set(tmdbIds)];

    try {
        const { data } = await supabase
            .from('video_sources')
            .select('tmdb_id, stream_url')
            .in('tmdb_id', uniqueIds);
        
        if (data) {
            data.forEach(source => {
                streamsCache[source.tmdb_id] = source.stream_url;
            });
            console.log(`[Live] ${data.length} fuentes cargadas en caché.`);
        }
    } catch (e) {
        console.error('[Live] Error pre-cargando fuentes:', e);
    }
}

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
                <div class="channel-progress-container">
                    <div class="channel-progress-fill" id="prog-${ch.id}" style="width: 0%"></div>
                </div>
            </div>
        `;
        item.onclick = () => switchChannel(ch.id);
        list.appendChild(item);
    });
    updateCurrentInfo();
}

async function switchChannel(id) {
    if (activeChannelId === id && !document.getElementById('livePlaceholder').classList.contains('hidden')) {
        // Ya estamos en este canal y cargando
    }
    
    activeChannelId = id;
    
    // UI Feedback
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    // Encontrar el elemento por ID de canal (más robusto que onclick)
    const items = document.querySelectorAll('.channel-item');
    LIVE_CHANNELS.forEach((ch, idx) => {
        if (ch.id === id && items[idx]) items[idx].classList.add('active');
    });

    const status = getCurrentShow(id);
    if (!status) return;

    const { currentShow } = status;
    
    const placeholder = document.getElementById('livePlaceholder');
    const playerCont = document.getElementById('livePlayerContainer');
    const info = document.getElementById('liveInfo');
    const wrapper = document.getElementById('livePlayerWrapper');

    // Efecto Glitch al cambiar
    wrapper.classList.add('channel-glitch');
    setTimeout(() => wrapper.classList.remove('channel-glitch'), 400);

    placeholder.classList.remove('hidden');
    playerCont.classList.add('hidden');
    info.classList.add('hidden');

    try {
        let streamUrl = streamsCache[currentShow.tmdb_id];
        
        if (!streamUrl) {
            const { data } = await supabase
                .from('video_sources')
                .select('stream_url')
                .eq('tmdb_id', currentShow.tmdb_id)
                .maybeSingle();
            streamUrl = data?.stream_url;
            if (streamUrl) streamsCache[currentShow.tmdb_id] = streamUrl;
        }

        if (streamUrl) {
            PLAYER_LOGIC._playSourceInElement(
                streamUrl, 
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
            document.getElementById('livePlaceholder').innerHTML = `
                <div class="no-signal">📡</div>
                <p>Sin señal en ${currentShow.title}</p>
                <span style="font-size:0.7rem; opacity:0.5">ID: ${currentShow.tmdb_id}</span>
            `;
        }
    } catch (e) {
        console.error('[Live] Error al sintonizar:', e);
    }
}

function updateCurrentInfo() {
    LIVE_CHANNELS.forEach(ch => {
        const status = getCurrentShow(ch.id);
        const titleEl = document.getElementById(`now-${ch.id}`);
        const progEl = document.getElementById(`prog-${ch.id}`);
        
        if (status) {
            if (titleEl) titleEl.textContent = status.currentShow.title;
            if (progEl) progEl.style.width = `${status.currentShow.progress}%`;
        }
    });

    const currentStatus = getCurrentShow(activeChannelId);
    const titleEl = document.getElementById('liveTitle');
    if (titleEl && currentStatus && titleEl.textContent !== currentStatus.currentShow.title) {
        console.log('[Live] Cambio de programa detectado, re-sintonizando...');
        switchChannel(activeChannelId);
    }
}

