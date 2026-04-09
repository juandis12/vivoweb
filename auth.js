import { CONFIG } from './config.js';
import { showToast } from './utils.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export let supabase = null;
export let currentProfile = null;
let heartbeatTimer = null;
let sessionChannel = null;

export async function initAuth(onAuthChange) {
    try {
        supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    } catch(e) { 
        console.warn('Supabase no disponible:', e); 
        return { user: null, profile: null };
    }

    // Carga inicial inmediata del perfil
    const stored = sessionStorage.getItem('vivotv_current_profile');
    if (stored) {
        try { currentProfile = JSON.parse(stored); } catch(e) { currentProfile = null; }
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
            const up = sessionStorage.getItem('vivotv_current_profile');
            currentProfile = up ? JSON.parse(up) : null;
            onAuthChange(event, session, currentProfile);
        } else {
            currentProfile = null;
            onAuthChange(event, null, null);
        }
    });

    const { data: { user } } = await supabase.auth.getUser();
    return { user, profile: currentProfile, supabase };
}

export function setCurrentProfile(profile) {
    currentProfile = profile;
    sessionStorage.setItem('vivotv_current_profile', JSON.stringify(profile));
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

        if (sessions && sessions.length > 2) {
            const isAuthorized = sessions.slice(0, 2).some(s => s.device_id === deviceId);
            if (!isAuthorized) {
                showToast('Límite de dispositivos alcanzado.');
                setTimeout(() => {
                    supabase.auth.signOut();
                    sessionStorage.clear();
                    window.location.href = 'index.html';
                }, 3000);
            }
        }
    } catch (e) {
        console.error('[Session Guard Error]:', e);
    }
}
