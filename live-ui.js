/**
 * live-ui.js — Controlador de Interfaz para Canales en Vivo
 */

import { LIVE_CHANNELS, getCurrentShow, buildLiveCatalog, findSimilarAvailable } from './live-engine.js';
import { supabase } from './config.js';
import { PLAYER_LOGIC } from './player.js';
import { fetchAvailableIds } from './catalog.js';

let activeChannelId = 'risa'; // Iniciamos en Risa como novedad
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
    
    const wrapper = document.getElementById('livePlayerWrapper');
    if (!wrapper) return; // No estamos en la página live

    // 1. Sincronizar Reloj con Servidor (Anti-Drift)
    await syncClock();

    // 2. Asegurar Catálogo (Esperar si es necesario)
    let catalog = window.DB_CATALOG || [];
    if (catalog.length === 0) {
        console.log('[Live] Esperando sincronización de catálogo...');
        await fetchAvailableIds(supabase);
        catalog = window.DB_CATALOG || [];
    }
    
    // 3. Generar Programación
    await buildLiveCatalog(catalog);

    // 4. Render UI
    renderChannelsList();
    await preloadStreams();
    switchChannel(activeChannelId);
    
    // 5. Setup EPG Events (Re-vincular siempre)
    window.setupEPGHandlers();

    // 6. Monitor Activo
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(() => {
        updateCurrentInfo();
        checkSyncDrift();
    }, 2000);
}

// Función global para manejar eventos de EPG (útil si la UI se refresca)
window.setupEPGHandlers = () => {
    const btnOpen = document.getElementById('btnOpenEPG');
    const btnClose = document.getElementById('btnCloseEPG');
    const modal = document.getElementById('epgModal');

    if (btnOpen) btnOpen.onclick = () => { 
        renderEPG(); 
        modal.classList.remove('hidden'); 
    };
    if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');
    
    // Cerrar al hacer clic fuera
    if (modal) {
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
    }
};

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
        const diff = Math.abs(expected - actual);

        // Si hay un desfase mayor a 10s, resincronizamos
        if (diff > 10) {
            console.warn('[Live] Detectado desfase. Resincronizando...');
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
}

async function switchChannel(id) {
    activeChannelId = id;
    
    document.querySelectorAll('.channel-item').forEach((el, idx) => {
        const channel = LIVE_CHANNELS[idx];
        if (channel) el.classList.toggle('active', channel.id === id);
    });

    let status = getCurrentShow(id);
    if (!status) {
        console.warn(`[Live] No hay status para canal ${id}`);
        return;
    }

    let { currentShow } = status;
    const wrapper = document.getElementById('livePlayerWrapper');
    const placeholder = document.getElementById('livePlaceholder');
    const playerCont = document.getElementById('livePlayerContainer');
    const info = document.getElementById('liveInfo');

    if (!wrapper) return;

    wrapper.classList.add('channel-glitch');
    setTimeout(() => wrapper.classList.remove('channel-glitch'), 400);

    placeholder.classList.remove('hidden');
    playerCont.classList.add('hidden');
    info.classList.add('hidden');

    try {
        // --- LÓGICA DE SUSTITUCIÓN INTELIGENTE ---
        let streamUrl = streamsCache[currentShow.tmdb_id];
        if (!streamUrl) {
            const { data } = await supabase.from('video_sources').select('stream_url').eq('tmdb_id', currentShow.tmdb_id).maybeSingle();
            streamUrl = data?.stream_url;
            if (streamUrl) streamsCache[currentShow.tmdb_id] = streamUrl;
        }

        // Si no hay stream, buscamos algo similar inmediatamente
        if (!streamUrl) {
            console.log(`[Live] '${currentShow.title}' no tiene fuente. Buscando similar...`);
            const fallback = findSimilarAvailable(currentShow.genreIds);
            if (fallback) {
                console.log(`[Live] Sustituyendo por: ${fallback.title || fallback.name}`);
                currentShow.tmdb_id = String(fallback.id || fallback.tmdb_id);
                currentShow.title = fallback.title || fallback.name;
                currentShow.offsetSeconds = Math.floor(Math.random() * 3000); // Iniciar en punto aleatorio
                
                const { data } = await supabase.from('video_sources').select('stream_url').eq('tmdb_id', currentShow.tmdb_id).maybeSingle();
                streamUrl = data?.stream_url;
            }
        }

        if (streamUrl) {
            PLAYER_LOGIC._playSourceInElement(streamUrl, currentShow.offsetSeconds, 'liveVideoPlayer', 'liveVideoIframe');
            placeholder.classList.add('hidden');
            playerCont.classList.remove('hidden');
            info.classList.remove('hidden');
            document.getElementById('liveTitle').textContent = currentShow.title;
            document.getElementById('liveNext').textContent = `A continuación: ${status.nextShow.title} (${status.nextShow.time})`;
        } else {
            placeholder.innerHTML = `<div class="no-signal">📡</div><p>Sintonizando contenido alternativo...</p>`;
            // Reintentar en 5s si de plano nada funcionó
            setTimeout(() => switchChannel(id), 5000);
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
        // Solo switch si el título cambió (cambio de programa natural)
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
        
        const shows = currentShowInfo ? [currentShowInfo.currentShow, currentShowInfo.nextShow] : [];
        
        col.innerHTML = `
            <div class="epg-channel-header">
                <div class="channel-icon" style="width:30px; height:30px; font-size:1rem; background:${ch.color}">${ch.icon}</div>
                <span style="font-size:0.8rem; font-weight:800">${ch.name}</span>
            </div>
            <div class="epg-shows">
                ${shows.map(show => `
                    <div class="epg-show-item ${show === currentShowInfo?.currentShow ? 'active' : ''}">
                        <span class="epg-time">${show.time}</span>
                        <span class="epg-name">${show.title}</span>
                    </div>
                `).join('')}
                ${shows.length === 0 ? '<p style="font-size:0.7rem; opacity:0.5; padding:10px;">Cargando...</p>' : ''}
            </div>
        `;
        grid.appendChild(col);
    });
}
