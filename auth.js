import { CONFIG, supabase as globalSupabase } from './config.js';
import { showToast } from './utils.js';

export let supabase = globalSupabase;
export let currentProfile = null;
let heartbeatTimer = null;
let sessionChannel = null;
let lastSessionCheck = 0; // Throttle: Evitar martilleo de sesiones
const SESSION_CHECK_COOLDOWN = 15000; // 15 segundos entre chequeos de seguridad

export async function initAuth(onAuthChange) {
    if (!supabase) supabase = globalSupabase;

    const safeCallback = (event, session, profile) => {
        if (typeof onAuthChange === 'function') {
            onAuthChange(event, session, profile);
        }
    };

    // Carga inicial inmediata del perfil
    const stored = localStorage.getItem('vivotv_current_profile');
    if (stored) {
        try { currentProfile = JSON.parse(stored); } catch(e) { currentProfile = null; }
    }

    // Configurar listener una sola vez
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log(`[VivoTV] 🔑 Auth Event: ${event}`);
        
        if (session?.user) {
            // Sincronizar perfil local si existe
            const up = localStorage.getItem('vivotv_current_profile');
            currentProfile = up ? JSON.parse(up) : null;
            safeCallback(event, session, currentProfile);
        } else if (event === 'SIGNED_OUT') {
            currentProfile = null;
            localStorage.removeItem('vivotv_current_profile');
            safeCallback(event, null, null);
        } else {
            safeCallback(event, null, null);
        }
    });

    // Retornar sesión actual inmediatamente
    const { data: { session } } = await supabase.auth.getSession();
    return { 
        user: session?.user || null, 
        profile: currentProfile, 
        supabase 
    };
}

export function setCurrentProfile(profile) {
    currentProfile = profile;
    localStorage.setItem('vivotv_current_profile', JSON.stringify(profile));
}

/**
 * Motor de Latidos y Telemetría para Sesiones Concurrentes
 * Sincroniza el estado de la sesión y lo que el usuario está viendo.
 */
export async function startHeartbeat() {
    if (!supabase || !currentProfile) return;
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    let lastSavedStatusJson = '';

    const sendPulse = async () => {
        try {
            // 1. Latido base de seguridad (RPC)
            await supabase.rpc('vivotv_heartbeat', { pid: currentProfile.id });

            // 2. Sincronización de Telemetría (¿Qué está viendo exactamente?)
            // Solo actualizamos si el estado ha cambiado para reducir tráfico y carga en DB
            const currentStatus = window.VIVOTV_VIEWING_STATUS;
            const currentStatusJson = JSON.stringify(currentStatus);
            
            if (currentStatusJson !== lastSavedStatusJson) {
                await supabase
                    .from('vivotv_profiles')
                    .update({ now_playing: currentStatus || null })
                    .eq('id', currentProfile.id);
                
                lastSavedStatusJson = currentStatusJson;
            }
        } catch(e) { 
            console.warn('[VivoTV] Heartbeat/Telemetry error:', e); 
        }
    };

    sendPulse();
    heartbeatTimer = setInterval(sendPulse, 10000); 

    // Suscripción Realtime para detectar expulsiones remotas
    subscribeToSessionChanges();
}

export async function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    if (sessionChannel) {
        supabase.removeChannel(sessionChannel);
        sessionChannel = null;
    }
    if (currentProfile && supabase) {
        await supabase.rpc('vivotv_release_session', { pid: currentProfile.id });
    }
}

function subscribeToSessionChanges() {
    if (!supabase || !currentProfile) return;
    if (sessionChannel) supabase.removeChannel(sessionChannel);

    sessionChannel = supabase
        .channel(`session-${currentProfile.id}`)
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'vivotv_profiles',
            filter: `id=eq.${currentProfile.id}`
        }, (payload) => {
            if (payload.new.last_heartbeat === null) {
                window.dispatchEvent(new CustomEvent('vivotv:remote-logout'));
            }
        })
        .subscribe();
}

/**
 * Genera una huella digital básica del dispositivo (Fase 1: Seguridad)
 * Combina UserAgent, resolución y zona horaria para dificultar la suplantación.
 */
function _getDeviceFingerprint() {
    const data = [
        navigator.userAgent,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        navigator.language
    ].join('###');
    
    // Hash ultra-rápido (b-hash) para no importar librerías pesadas
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data.charCodeAt(i);
        hash |= 0;
    }
    return 'vtv-' + Math.abs(hash).toString(16);
}

export async function checkConcurrentSessions() {
    const now = Date.now();
    if (now - lastSessionCheck < SESSION_CHECK_COOLDOWN) {
        return; // Throttling: Ya se verificó hace poco
    }
    lastSessionCheck = now;

    try {
        // OPTIMIZACIÓN: Usar getSession en lugar de getUser para evitar bloqueos de instancia (Lock 5000ms)
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        // 1. Obtener o generar ID de dispositivo persistente
        let deviceId = localStorage.getItem('vivotv_device_id');
        if (!deviceId) {
            deviceId = _getDeviceFingerprint();
            localStorage.setItem('vivotv_device_id', deviceId);
        }

        // VALIDACIÓN: Evitar error 400 si los parámetros no están listos
        if (!user.id || !deviceId) {
            console.warn('[Session Guard] UID o DID no detectado. Reintentando después...');
            lastSessionCheck = 0; // Reset para que el siguiente intento no espere 15s
            return;
        }

        console.log(`[Session Guard] Verificando concurrencia para: ${user.email} (DID: ${deviceId})`);

        const { data: sessionResult, error: rpcError } = await supabase.rpc('vivotv_check_session_limit', {
            uid: user.id,
            did: deviceId
        });

        if (rpcError) {
            console.warn('[Session Guard] RPC Error:', rpcError.message);
            // Si la función aún no existe, usamos el fallback manual (Legacy)
            if (rpcError.code === 'P0001' || rpcError.message.includes('vivotv_check_session_limit')) {
                await _legacyCheckSessions(user.id, deviceId);
            }
            return;
        }

        if (sessionResult && sessionResult.allowed === false) {
            showToast('⚠️ Límite de dispositivos excedido. Cerrando sesión...', 'error', 5000);
            setTimeout(() => {
                supabase.auth.signOut().then(() => {
                    localStorage.removeItem('vivotv_current_profile');
                    window.location.href = 'index.html';
                });
            }, 4000);
        }

    } catch (e) {
        console.error('[Session Guard Error]:', e);
    }
}

/**
 * Lógica de respaldo mientras el usuario aplica el SQL (Legacy)
 */
async function _legacyCheckSessions(userId, deviceId) {
    const twoMinAgo = new Date(Date.now() - 120000).toISOString();
    
    // Upsert latido de sesión activa
    await supabase.from('active_sessions').upsert(
        { user_id: userId, device_id: deviceId, last_seen: new Date().toISOString() },
        { onConflict: 'user_id, device_id' }
    );

    const { data: sessions } = await supabase.from('active_sessions')
        .select('device_id')
        .eq('user_id', userId)
        .gt('last_seen', twoMinAgo);

    if (sessions && sessions.length > 2) {
        const isAuthorized = sessions.slice(0, 2).some(s => s.device_id === deviceId);
        if (!isAuthorized) {
            showToast('Límite de 2 dispositivos alcanzado.', 'warning');
        }
    }
}
