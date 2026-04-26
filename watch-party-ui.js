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
    if (!partyId) return;
    
    showToast('Resolviendo enlace de Watch Party...', 'info');

    // Corregir strings malformadas que WhatsApp o navegadores dañan
    let cleanId = partyId.replace(/[^a-zA-Z0-9-]/g, '').trim(); 
    if (cleanId.length === 32 && !cleanId.includes('-')) {
        // Re-injectar guiones si se perdieron
        cleanId = cleanId.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    }

    const profile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
    if (!profile) {
        showToast('Debes seleccionar un perfil primero para unirte', 'warning');
        return;
    }

    const manager = getManager();
    if (!manager) {
        showToast('Error interno: Manager no inicializado.', 'error');
        return;
    }

    const party = await manager.joinParty(cleanId);
    if (!party) return;

    // Configurar el listener de sincronización
    manager.onSync((payload) => {
        handleReceivedSync(payload);
    });

    console.log('[WatchParty] Abriendo contenido:', party.tmdb_id, party.media_type);
    showToast('Sala encontrada. Abriendo reproductor...', 'success');
    
    // Abrir el detalle del contenido automáticamente
    await PLAYER_LOGIC.openDetail(party.tmdb_id, party.media_type, supabase);
    
    // Empezar cuenta regresiva visual para bypass de autoplay
    setTimeout(() => {
        const playBtn = document.getElementById('btnModalPlay');
        if (playBtn) {
            console.log('[WatchParty] Simulando Play Button para sincronizar.');
            playBtn.click();
        } else {
            console.error('[WatchParty] No se encontró btnModalPlay');
            showToast('Pulsa el botón Reproducir para sincronizarte', 'info');
        }
    }, 1500);
    
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
        // Configuración inicial de posición (arriba a la derecha)
        hud.style.position = 'fixed';
        hud.style.top = '20px';
        hud.style.right = '20px';
        hud.style.bottom = 'auto';
        hud.style.cursor = 'move';
        hud.style.zIndex = '2147483647';
        document.body.appendChild(hud);
        
        // --- LÓGICA DRAGGABLE (Arrastrable HUD) ---
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        const dragStart = (e) => {
            if (e.target.closest('button')) return; // No arrastrar si presiona un botón
            initialX = e.type === "touchstart" ? e.touches[0].clientX - xOffset : e.clientX - xOffset;
            initialY = e.type === "touchstart" ? e.touches[0].clientY - yOffset : e.clientY - yOffset;
            isDragging = true;
        };

        const dragEnd = () => {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
        };

        const drag = (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.type === "touchmove" ? e.touches[0].clientX - initialX : e.clientX - initialX;
                currentY = e.type === "touchmove" ? e.touches[0].clientY - initialY : e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;
                hud.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
            }
        };

        hud.addEventListener("touchstart", dragStart, { passive: false });
        hud.addEventListener("touchend", dragEnd, { passive: false });
        hud.addEventListener("touchmove", drag, { passive: false });
        hud.addEventListener("mousedown", dragStart);
        document.addEventListener("mouseup", dragEnd);
        document.addEventListener("mousemove", drag);
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
        executeImmediateSync();
    }, 2000);
}

/**
 * Ejecuta una sincronización inmediata (Usado para saltos rápidos)
 */
export function executeImmediateSync() {
    const manager = getManager();
    if (!manager || !manager.isHost) return;

    if (PLAYER_LOGIC && PLAYER_LOGIC.getCurrentPlaybackState) {
        const state = PLAYER_LOGIC.getCurrentPlaybackState();
        if (state) {
            manager.broadcastSync(state.currentTime, state.isPlaying);
        }
    }
}

// Listener global para Forzar saltos instantáneos (Skips/Ads)
window.addEventListener('vivotv:force_party_sync', () => {
    executeImmediateSync();
});

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
