/**
 * live-ui.js — Controlador de Interfaz para Canales en Vivo
 */

import { LIVE_CHANNELS, getCurrentShow, buildLiveCatalog } from './live-engine.js';
import { supabase } from './config.js';
import { PLAYER_LOGIC } from './player.js';
import { fetchAvailableIds } from './catalog.js';

let activeChannelId = 'action';
let streamsCache = {};
let updateInterval = null;
let serverOffset = 0;

document.addEventListener('DOMContentLoaded', () => {
    initLive();
});

// Soporte para cambios de página SPA
window.addEventListener('vivotv:page-changed', (e) => {
    if (e.detail.url.includes('live.html')) {
        initLive();
    } else if (updateInterval) {
        clearInterval(updateInterval);
    }
});

async function initLive() {
    console.log('[Live] Iniciando Motor de Programación...');
    
    // 1. Sincronizar Reloj con Servidor (Anti-Drift)
    await syncClock();

    // 2. Asegurar Catálogo
    let catalog = window.DB_CATALOG || [];
    if (catalog.length === 0) {
        await fetchAvailableIds(supabase);
        catalog = window.DB_CATALOG || [];
    }
    
    // 3. Generar Programación
    await buildLiveCatalog(catalog);

    // 4. Render UI
    renderChannelsList();
    await preloadStreams();
    switchChannel(activeChannelId);
    
    // 5. Setup EPG Events
    const btnOpen = document.getElementById('btnOpenEPG');
    const btnClose = document.getElementById('btnCloseEPG');
    const modal = document.getElementById('epgModal');

    if (btnOpen) btnOpen.onclick = () => { renderEPG(); modal.classList.remove('hidden'); };
    if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');

    // 6. Monitor Activo (Cada 10s para UI, cada 2s para Anti-Ads)
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(() => {
        updateCurrentInfo();
        checkSyncDrift();
    }, 2000);
}

async function syncClock() {
    try {
        const start = Date.now();
        const response = await fetch(supabase.supabaseUrl + '/rest/v1/', {
            method: 'HEAD',
            headers: { 'apikey': supabase.supabaseKey }
        });
        const end = Date.now();
        const serverDateStr = response.headers.get('date');
        if (serverDateStr) {
            const serverTime = new Date(serverDateStr).getTime();
            serverOffset = (serverTime + (end - start)/2) - end;
            console.log(`[Live] Reloj Calibrado. Offset: ${serverOffset}ms`);
        }
    } catch (e) {
        console.warn('[Live] Fallo sync clock, usando local.');
    }
}

function checkSyncDrift() {
    const video = document.querySelector('.active-tv-video');
    if (!video || video.paused || video.seeking) return;

    const status = getCurrentShow(activeChannelId);
    if (status?.currentShow) {
        const expected = status.currentShow.offsetSeconds;
        const actual = video.currentTime;
        const diff = expected - actual;

        // Si hay un desfase mayor a 5s (publicidad o lag), resincronizamos
        if (diff > 5) {
            console.warn('[Live] Detectado desfase crítico. Resincronizando...');
            video.currentTime = expected;
        }
    }
}

async function preloadStreams() {
    const tmdbIds = LIVE_CHANNELS.flatMap(ch => {
        const status = getCurrentShow(ch.id);
        return status ? [status.currentShow.tmdb_id] : [];
    });
    const uniqueIds = [...new Set(tmdbIds)];

    try {
        const { data } = await supabase
            .from('video_sources')
            .select('tmdb_id, stream_url')
            .in('tmdb_id', uniqueIds);
        
        if (data) {
            data.forEach(source => { streamsCache[source.tmdb_id] = source.stream_url; });
        }
    } catch (e) { console.error('[Live] Error pre-cargando fuentes:', e); }
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
    activeChannelId = id;
    
    document.querySelectorAll('.channel-item').forEach((el, idx) => {
        el.classList.toggle('active', LIVE_CHANNELS[idx].id === id);
    });

    const status = getCurrentShow(id);
    if (!status) return;

    const { currentShow } = status;
    const wrapper = document.getElementById('livePlayerWrapper');
    const placeholder = document.getElementById('livePlaceholder');
    const playerCont = document.getElementById('livePlayerContainer');
    const info = document.getElementById('liveInfo');

    wrapper.classList.add('channel-glitch');
    setTimeout(() => wrapper.classList.remove('channel-glitch'), 400);

    placeholder.classList.remove('hidden');
    playerCont.classList.add('hidden');
    info.classList.add('hidden');

    try {
        let streamUrl = streamsCache[currentShow.tmdb_id];
        if (!streamUrl) {
            const { data } = await supabase.from('video_sources').select('stream_url').eq('tmdb_id', currentShow.tmdb_id).maybeSingle();
            streamUrl = data?.stream_url;
            if (streamUrl) streamsCache[currentShow.tmdb_id] = streamUrl;
        }

        if (streamUrl) {
            PLAYER_LOGIC._playSourceInElement(streamUrl, currentShow.offsetSeconds, 'liveVideoPlayer', 'liveVideoIframe');
            placeholder.classList.add('hidden');
            playerCont.classList.remove('hidden');
            info.classList.remove('hidden');
            document.getElementById('liveTitle').textContent = currentShow.title;
            document.getElementById('liveNext').textContent = `A continuación: ${status.nextShow.title} (${status.nextShow.time})`;
        } else {
            placeholder.innerHTML = `<div class="no-signal">📡</div><p>Sin señal en ${currentShow.title}</p>`;
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
    if (currentStatus && document.getElementById('liveTitle')?.textContent !== currentStatus.currentShow.title) {
        switchChannel(activeChannelId);
    }
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
                <div class="channel-icon" style="width:30px; height:30px; font-size:1rem; background:${ch.color}">${ch.icon}</div>
                <span style="font-size:0.8rem; font-weight:800">${ch.name}</span>
            </div>
            <div class="epg-shows">
                ${(currentShowInfo ? [currentShowInfo.currentShow, currentShowInfo.nextShow] : []).map(show => `
                    <div class="epg-show-item">
                        <span class="epg-time">${show.time}</span>
                        <span class="epg-name">${show.title}</span>
                    </div>
                `).join('')}
            </div>
        `;
        grid.appendChild(col);
    });
}
