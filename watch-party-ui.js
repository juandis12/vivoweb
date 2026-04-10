/**
 * watch-party-ui.js — UI y Controladores para Watch Parties
 */

import { WatchPartyManager } from './watch-party.js';
import { supabase } from './config.js';
import { PLAYER_LOGIC } from './player.js';
import { showToast } from './utils.js';

let partyManager = null;
let syncInterval = null;

/**
 * Inicializa el manager si no existe
 */
function getManager() {
    if (!partyManager && supabase) {
        const profile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
        if (!profile) return null;
        partyManager = new WatchPartyManager(supabase, profile.user_id, profile.name);
    }
    return partyManager;
}

/**
 * Lógica para unirse desde una URL (Llamada desde app.js)
 */
export async function joinPartyFromUrl(partyId) {
    const manager = getManager();
    if (!manager) return;

    const party = await manager.joinParty(partyId);
    if (!party) return;

    // Configurar el listener de sincronización
    manager.onSync((payload) => {
        handleReceivedSync(payload);
    });

    // Abrir el detalle del contenido automáticamente
    await PLAYER_LOGIC.openDetail(party.tmdb_id, party.media_type, supabase);
    
    // Inyectar estado visual de sala
    showPartyHUD(party.creator_name);
}

/**
 * Crea una sala desde el botón del detalle
 */
export async function createPartyUI(tmdbId, mediaType) {
    const manager = getManager();
    if (!manager) return;

    const partyId = await manager.createParty(tmdbId, mediaType);
    if (partyId) {
        const shareUrl = `${window.location.origin}${window.location.pathname}?party=${partyId}`;
        
        // Copiar al portapapeles
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('Enlace de invitación copiado al portapapeles', 'info');
        });

        showPartyHUD('Tú (Host)', partyId);
    }
}

/**
 * Muestra un indicador visual de que estás en sala
 */
function showPartyHUD(hostName, partyId = null) {
    let hud = document.getElementById('partyHUD');
    if (!hud) {
        hud = document.createElement('div');
        hud.id = 'partyHUD';
        hud.className = 'glass-floating-card party-hud';
        document.body.appendChild(hud);
    }

    hud.innerHTML = `
        <div class="floating-card-content">
            <span class="floating-badge">WATCH PARTY</span>
            <h3>Sala de ${hostName}</h3>
            <p>${partyId ? 'Copia el link para invitar amigos' : 'Sincronizado con el anfitrión'}</p>
            <div class="floating-card-actions">
                <button class="float-btn float-btn-outline" id="btnLeaveParty">Salir</button>
            </div>
        </div>
    `;

    document.getElementById('btnLeaveParty').onclick = () => {
        const manager = getManager();
        if (manager) manager.leaveParty();
        hud.remove();
        if (syncInterval) clearInterval(syncInterval);
    };
}

/**
 * Maneja la sincronización recibida (Para invitados)
 */
function handleReceivedSync(payload) {
    const video = document.getElementById('videoPlayer');
    if (!video || video.classList.contains('hidden')) return;

    const diff = Math.abs(video.currentTime - payload.currentTime);
    
    // Si la diferencia es mayor a 3 segundos, forzar seek
    if (diff > 3) {
        video.currentTime = payload.currentTime;
    }

    // Sincronizar estado Play/Pause
    if (payload.isPlaying && video.paused) video.play().catch(() => {});
    else if (!payload.isPlaying && !video.paused) video.pause();
}

/**
 * Inicia el loop de broadcast (Para el Host)
 */
export function startHostSyncLoop() {
    const manager = getManager();
    if (!manager || !manager.isHost) return;

    if (syncInterval) clearInterval(syncInterval);
    
    syncInterval = setInterval(() => {
        const video = document.getElementById('videoPlayer');
        if (video && !video.classList.contains('hidden')) {
            manager.broadcastSync(video.currentTime, !video.paused);
        }
    }, 2000); // Sincronizar cada 2 segundos
}
