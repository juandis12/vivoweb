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
            
            <!-- Social Emotes UI -->
            <div class="party-emotes" style="display:flex; gap:10px; margin: 15px 0; justify-content:center;">
                <button class="btn-emote" data-emote="😂" style="font-size:1.5rem; background:transparent; border:none; cursor:pointer; transition:transform 0.2s;">😂</button>
                <button class="btn-emote" data-emote="😱" style="font-size:1.5rem; background:transparent; border:none; cursor:pointer; transition:transform 0.2s;">😱</button>
                <button class="btn-emote" data-emote="😍" style="font-size:1.5rem; background:transparent; border:none; cursor:pointer; transition:transform 0.2s;">😍</button>
                <button class="btn-emote" data-emote="👀" style="font-size:1.5rem; background:transparent; border:none; cursor:pointer; transition:transform 0.2s;">👀</button>
                <button class="btn-emote" data-emote="🍿" style="font-size:1.5rem; background:transparent; border:none; cursor:pointer; transition:transform 0.2s;">🍿</button>
            </div>

            <div class="floating-card-actions">
                <button class="float-btn float-btn-outline" id="btnLeaveParty">Salir</button>
            </div>
        </div>
    `;

    // Eventos Emotes
    hud.querySelectorAll('.btn-emote').forEach(btn => {
        btn.onclick = () => {
            btn.style.transform = 'scale(1.3)';
            setTimeout(() => btn.style.transform = 'scale(1)', 200);
            
            const manager = getManager();
            if (manager) manager.broadcastEmote(btn.dataset.emote);
        };
    });

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
    if (PLAYER_LOGIC && PLAYER_LOGIC.syncPlaybackState) {
        PLAYER_LOGIC.syncPlaybackState(payload);
    }
}

/**
 * Inicia el loop de broadcast (Para el Host)
 */
export function startHostSyncLoop() {
    const manager = getManager();
    if (!manager || !manager.isHost) return;

    if (syncInterval) clearInterval(syncInterval);
    
    syncInterval = setInterval(() => {
        if (PLAYER_LOGIC && PLAYER_LOGIC.getCurrentPlaybackState) {
            const state = PLAYER_LOGIC.getCurrentPlaybackState();
            if (state) {
                manager.broadcastSync(state.currentTime, state.isPlaying);
            }
        }
    }, 2000); // Sincronizar cada 2 segundos
}

/**
 * Escuchador Global de Emotes: Renderiza el globo flotante
 */
window.addEventListener('vivotv:party_emote', (e) => {
    const { emote, sender } = e.detail;
    
    const container = document.getElementById('playerContainer');
    if (!container || container.classList.contains('hidden')) return;

    const el = document.createElement('div');
    el.className = 'floating-emote';
    el.innerHTML = `<span>${sender}</span> ${emote}`;
    
    // Posición aleatoria en el eje X (20% a 80% de la pantalla)
    const randomX = Math.floor(Math.random() * 60) + 20;
    el.style.left = `${randomX}%`;
    
    container.appendChild(el);
    
    // Auto destruir después de 3s
    setTimeout(() => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 3000);
});
