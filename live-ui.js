/**
 * live-ui.js — Controlador de Interfaz para Canales en Vivo
 */

import { LIVE_CHANNELS, getCurrentShow, buildLiveCatalog, findSimilarAvailable, setServerOffset } from './live-engine.js';
import { supabase } from './config.js';
import { PLAYER_LOGIC } from './player.js';
import { fetchAvailableIds } from './catalog.js';

let activeChannelId = 'risa'; 
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
    if (!wrapper) return; 

    // 1. Render UI Inicial (con placeholders)
    renderChannelsList();

    // 2. Sincronizar Reloj con Servidor (Anti-Drift)
    await syncClock();
    setServerOffset(serverOffset);

    // 3. Esperar Catálogo (Polling hasta que haya datos)
    const catalog = await waitForCatalog();
    
    // 4. Generar Programación
    await buildLiveCatalog(catalog);

    // 5. Refrescar UI con datos reales
    renderChannelsList();
    await preloadStreams();
    switchChannel(activeChannelId);
    
    // 5. Setup EPG Events
    window.setupEPGHandlers();

    // 6. Monitor Activo
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(() => {
        updateCurrentInfo();
        checkSyncDrift();
    }, 2000);
}

/**
 * Espera pacientemente a que la base de datos entregue el catálogo.
 * Evita la "Guerra de Instancias" entre app.js y live-ui.js.
 */
async function waitForCatalog() {
    const placeholder = document.getElementById('livePlaceholder');
    if (placeholder) {
        placeholder.innerHTML = `
            <div class="loader-wave"><span></span><span></span><span></span></div>
            <p id="syncStatus">Sincronizando Base de Datos...</p>
        `;
    }

    let attempts = 0;
    return new Promise((resolve) => {
        const check = async () => {
            attempts++;
            const catalog = window.DB_CATALOG || [];
            
            // Requisito crítico: Esperar a que el bloque prioritario de TMDB esté completamente cargado
            if (catalog.length > 0 && window.isPriorityMetadataSynced) {
                console.log(`[Live] Catálogo con metadatos detectado (${catalog.length} items). Activando motor.`);
                if (placeholder) placeholder.innerHTML = `
                    <div class="loader-wave"><span></span><span></span><span></span></div>
                    <p>Buscando Programación...</p>
                `;
                resolve(catalog);
            } else {
                // Si llevamos mucho tiempo, forzar una sincronización
                if (attempts % 5 === 0) {
                    console.log('[Live] Sincronización lenta, re-intentando fetch...');
                    fetchAvailableIds(supabase);
                }

                // Fallback de seguridad: si tras 30s no hay nada, usar catálogo vacío para no bloquear la UI
                if (attempts > 30) {
                    console.warn('[Live] Tiempo de espera de catálogo agotado. Iniciando modo degradado.');
                    resolve([]);
                    return;
                }

                setTimeout(check, 1000);
            }
        };
        check();
    });
}

// Función global para manejar eventos de EPG
window.setupEPGHandlers = () => {
    const btnOpen = document.getElementById('btnOpenEPG');
    const btnClose = document.getElementById('btnCloseEPG');
    const modal = document.getElementById('epgModal');

    if (btnOpen) btnOpen.onclick = () => { 
        renderEPG(); 
        modal.classList.remove('hidden'); 
    };
    if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');
    
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
        const serverTime = new Date(response.headers.get('date')).getTime();
        serverOffset = (serverTime + (end - start)/2) - end;
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

        if (diff > 12) {
            console.warn('[Live] Desfase detectado. Sincronizando flujo...');
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
        const { data } = await supabase.from('video_sources').select('tmdb_id, stream_url').in('tmdb_id', uniqueIds);
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
                <span class="channel-now" id="now-${ch.id}">Sincronizando...</span>
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
    const prevId = activeChannelId;
    activeChannelId = id;
    
    document.querySelectorAll('.channel-item').forEach((el, idx) => {
        const channel = LIVE_CHANNELS[idx];
        if (channel) el.classList.toggle('active', channel.id === id);
    });

    let status = getCurrentShow(id);
    if (!status) return;

    let { currentShow } = status;
    const wrapper = document.getElementById('livePlayerWrapper');
    const placeholder = document.getElementById('livePlaceholder');
    const playerCont = document.getElementById('livePlayerContainer');
    const info = document.getElementById('liveInfo');

    if (!wrapper) return;

    // Solo glitch si cambiamos de canal manualmente
    if (prevId !== id) {
        wrapper.classList.add('channel-glitch');
        setTimeout(() => wrapper.classList.remove('channel-glitch'), 400);
    }

    placeholder.classList.remove('hidden');
    placeholder.innerHTML = `
        <div class="loader-wave"><span></span><span></span><span></span></div>
        <p>Sintonizando ${currentShow.title}...</p>
    `;
    playerCont.classList.add('hidden');
    info.classList.add('hidden');

    try {
        let streamUrl = streamsCache[currentShow.tmdb_id];
        if (!streamUrl) {
            const { data } = await supabase.from('video_sources').select('stream_url').eq('tmdb_id', currentShow.tmdb_id).maybeSingle();
            streamUrl = data?.stream_url;
            if (streamUrl) streamsCache[currentShow.tmdb_id] = streamUrl;
        }

        if (!streamUrl) {
            const fallback = findSimilarAvailable(currentShow.genreIds);
            if (fallback) {
                currentShow.tmdb_id = String(fallback.id || fallback.tmdb_id);
                currentShow.title = fallback.title || fallback.name;
                currentShow.offsetSeconds = Math.floor(Math.random() * 2000); 
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
            
            if (status.nextShow) {
                const localNextTime = formatUTCToLocal(status.nextShow.time);
                document.getElementById('liveNext').textContent = `Siguiente: ${status.nextShow.title} (${localNextTime})`;
            } else {
                document.getElementById('liveNext').textContent = 'Programación finalizada';
            }
        } else {
            placeholder.innerHTML = `<div class="no-signal">📡</div><p>Buscando señal alternativa...</p>`;
            setTimeout(() => switchChannel(id), 5000);
        }
    } catch (e) { console.error('[Live] Error:', e); }
}

function updateCurrentInfo() {
    LIVE_CHANNELS.forEach(ch => {
        const status = getCurrentShow(ch.id);
        const titleEl = document.getElementById(`now-${ch.id}`);
        const progEl = document.getElementById(`prog-${ch.id}`);
        if (status && status.currentShow) {
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
        const shows = currentShowInfo ? [currentShowInfo.currentShow, currentShowInfo.nextShow] : [];
        
        col.innerHTML = `
            <div class="epg-channel-header">
                <div class="channel-icon" style="width:30px; height:30px; font-size:1rem; background:${ch.color}">${ch.icon}</div>
                <span style="font-size:0.8rem; font-weight:800">${ch.name}</span>
            </div>
            <div class="epg-shows">
                ${shows.map(show => {
                    if (!show) return '';
                    return `
                        <div class="epg-show-item ${show === currentShowInfo?.currentShow ? 'active' : ''}">
                            <span class="epg-time">${formatUTCToLocal(show.time)}</span>
                            <span class="epg-name">${show.title}</span>
                        </div>
                    `;
                }).join('')}
                ${shows.length === 0 ? '<p style="font-size:0.7rem; opacity:0.5; padding:10px;">Sin datos</p>' : ''}
            </div>
        `;
        grid.appendChild(col);
    });
}

/**
 * Convierte un string de hora UTC (HH:MM) a la hora local del usuario.
 * @param {string} utcTimeStr - Hora en formato "HH:MM" UTC.
 */
function formatUTCToLocal(utcTimeStr) {
    if (!utcTimeStr || typeof utcTimeStr !== 'string') return '--:--';
    const parts = utcTimeStr.split(':');
    if (parts.length < 2) return '--:--';
    
    const h = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    
    if (isNaN(h) || isNaN(m)) return '--:--';
    
    // Crear objeto fecha hoy y ajustar a UTC h:m
    const date = new Date();
    date.setUTCHours(h);
    date.setUTCMinutes(m);
    date.setUTCSeconds(0);
    date.setUTCMilliseconds(0);
    
    // Regresamos el string en hora local del navegador
    const localH = date.getHours().toString().padStart(2, '0');
    const localM = date.getMinutes().toString().padStart(2, '0');
    return `${localH}:${localM}`;
}
