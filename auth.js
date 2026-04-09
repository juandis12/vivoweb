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

export async function checkConcurrentSessions() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        let deviceId = localStorage.getItem('vivotv_device_id') || crypto.randomUUID();
        localStorage.setItem('vivotv_device_id', deviceId);

        await supabase.from('active_sessions').upsert(
            { user_id: user.id, device_id: deviceId, last_seen: new Date().toISOString() },
            { onConflict: 'user_id, device_id' }
        );

        const twoMinAgo = new Date(Date.now() - 120000).toISOString();
        const { data: sessions } = await supabase.from('active_sessions')
            .select('*')
            .eq('user_id', user.id)
            .gt('last_seen', twoMinAgo);

        if (sessions && sessions.length > 5) { // Umbral aumentado para depuración
            const isAuthorized = sessions.slice(0, 5).some(s => s.device_id === deviceId);
            if (!isAuthorized) {
                console.warn('[VivoTV] Límite de dispositivos excedido, pero omitiendo signOut para pruebas.');
                // showToast('Límite de dispositivos alcanzado.');
                // setTimeout(() => {
                //     supabase.auth.signOut();
                //     localStorage.removeItem('vivotv_current_profile');
                //     window.location.href = 'index.html';
                // }, 3000);
            }
        }
    } catch (e) {
        console.error('[Session Guard Error]:', e);
    }
}
