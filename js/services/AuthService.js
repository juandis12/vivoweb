import { 
    initAuth, 
    startHeartbeat, 
    stopHeartbeat, 
    checkConcurrentSessions, 
    setCurrentProfile as setLocalProfile 
} from '../auth.js';
import { supabase } from '../config.js';
import { showToast } from '../utils.js';

/**
 * AuthService: Capa de abstracción para la gestión de usuarios y sesiones.
 * Centraliza la comunicación con auth.js y Supabase.
 */
export const AuthService = {
    user: null,
    profile: null,

    /**
     * Inicializa la autenticación y configura listeners globales.
     */
    async initialize(onStateChange) {
        const { user, profile } = await initAuth((event, session, currentProfile) => {
            this.user = session?.user || null;
            this.profile = currentProfile;
            
            if (onStateChange) {
                onStateChange(event, session, currentProfile);
            }

            if (event === 'SIGNED_IN') {
                this.startSessionMonitoring();
            } else if (event === 'SIGNED_OUT') {
                this.stopSessionMonitoring();
            }
        });

        this.user = user;
        this.profile = profile;

        if (this.user) {
            this.startSessionMonitoring();
        }

        return { user, profile };
    },

    /**
     * Inicia el latido y la verificación de seguridad.
     */
    startSessionMonitoring() {
        startHeartbeat();
        // Verificar concurrencia cada vez que se activa la ventana o periódicamente
        checkConcurrentSessions();
        window.addEventListener('focus', () => checkConcurrentSessions());
    },

    /**
     * Detiene el monitoreo.
     */
    stopSessionMonitoring() {
        stopHeartbeat();
    },

    /**
     * Cambia el perfil activo.
     */
    async switchProfile(profile) {
        setLocalProfile(profile);
        this.profile = profile;
        
        // Sincronizar en Supabase para Handover cross-device
        if (this.user) {
            await supabase.auth.updateUser({
                data: { last_profile_id: profile.id }
            });
        }
        
        sessionStorage.setItem('vivotv_profile_chosen', 'true');
        window.location.href = 'dashboard.html';
    },

    /**
     * Cierra la sesión globalmente.
     */
    async logout() {
        showToast('Cerrando sesión...', 'info');
        this.stopSessionMonitoring();
        localStorage.removeItem('vivotv_current_profile');
        sessionStorage.removeItem('vivotv_profile_chosen');
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Error al cerrar sesión:', error);
            window.location.href = 'index.html'; // Fallback forzado
        }
    },

    /**
     * Verifica si hay una sesión válida.
     */
    isAuthenticated() {
        return !!this.user;
    },

    /**
     * Obtiene el perfil actual de forma segura.
     */
    getCurrentProfile() {
        if (this.profile) return this.profile;
        const stored = localStorage.getItem('vivotv_current_profile');
        return stored ? JSON.parse(stored) : null;
    }
};
