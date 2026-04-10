import { CONFIG } from './config.js';
import { showToast } from './utils.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export let supabase = null;
export let currentProfile = null;
let heartbeatTimer = null;
let sessionChannel = null;

export async function initAuth(onAuthChange) {
    try {
        supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                storageKey: `sb-${CONFIG.SUPABASE_URL.split('//')[1].split('.')[0]}-auth-token`,
                storage: window.localStorage,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
    } catch(e) { 
        console.warn('Supabase no disponible:', e); 
        return { user: null, profile: null };
    }

    // Carga inicial inmediata del perfil (Fase Persistencia Robusta)
    const stored = localStorage.getItem('vivotv_current_profile');
    if (stored) {
        try { currentProfile = JSON.parse(stored); } catch(e) { currentProfile = null; }
    }

    return new Promise((resolve) => {
        let resolved = false;

        const authListener = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log(`[VivoTV] Auth Event: ${event}`);
            
            if (session?.user) {
                const up = localStorage.getItem('vivotv_current_profile');
                currentProfile = up ? JSON.parse(up) : null;
                onAuthChange(event, session, currentProfile);
                
                if (!resolved) {
                    resolved = true;
                    resolve({ user: session.user, profile: currentProfile, supabase });
                }
            } else if (event === 'SIGNED_OUT') {
                currentProfile = null;
                localStorage.removeItem('vivotv_current_profile');
                onAuthChange(event, null, null);
                if (!resolved) {
                    resolved = true;
                    resolve({ user: null, profile: null, supabase });
                }
            } else if (event === 'INITIAL_SESSION' && !session) {
                // Si es el evento inicial y no hay sesión, esperamos un poco más 
                // por si getUser() o el motor de recuperación logran rescatarla.
                onAuthChange(event, null, null);
            }
        });

        // Timeout de seguridad progresivo
        setTimeout(async () => {
            if (resolved) return;
            console.log('[VivoTV] Segundo intento de recuperación...');
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                resolved = true;
                resolve({ user: user, profile: currentProfile, supabase });
            } else {
                // Última oportunidad (3.5s total)
                setTimeout(async () => {
                   if (resolved) return;
                   const { data: { user: lastTry } } = await supabase.auth.getUser();
                   resolved = true;
                   resolve({ user: lastTry || null, profile: currentProfile, supabase });
                }, 1000);
            }
        }, 2500);
    });
}

export function setCurrentProfile(profile) {
    currentProfile = profile;
    localStorage.setItem('vivotv_current_profile', JSON.stringify(profile));
}

/**
 * Motor de Latidos para Sesiones Concurrentes
 */
export async function startHeartbeat() {
    if (!supabase || !currentProfile) return;
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    const sendPulse = async () => {
        try {
            await supabase.rpc('vivotv_heartbeat', { pid: currentProfile.id });
        } catch(e) { console.warn('[VivoTV] Heartbeat error:', e); }
    };

    sendPulse();
    heartbeatTimer = setInterval(sendPulse, 10000); 

    // Suscripción Realtime
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
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Obtener o generar ID de dispositivo persistente
        let deviceId = localStorage.getItem('vivotv_device_id');
        if (!deviceId) {
            deviceId = _getDeviceFingerprint();
            localStorage.setItem('vivotv_device_id', deviceId);
        }

        /**
         * 2. Validar Límite vía RPC (Fase de Servidor)
         * El script SQL que el usuario ejecutará crea esta función 'vivotv_check_session_limit'.
         * Esto es mucho más seguro que contar en el cliente.
         */
        const { data: sessionResult, error: rpcError } = await supabase.rpc('vivotv_check_session_limit', {
            uid: user.id,
            did: deviceId
        });

        if (rpcError) {
            // Si la función aún no existe (antes del SQL), usamos el fallback manual (Legacy)
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
