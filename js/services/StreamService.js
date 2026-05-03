import { supabase } from '../config.js';
import { showToast } from '../utils.js';

/**
 * StreamService: Gestiona la lógica de reproducción, fuentes y telemetría.
 * Desacopla el motor de video de la interfaz de usuario.
 */
export const StreamService = {
    hls: null,
    currentSource: null,
    progressInterval: null,

    /**
     * Determina el tipo de reproductor necesario para una URL.
     */
    getPlayerType(url) {
        if (!url) return 'none';
        
        const directExtensions = /\.(mp4|m3u8|webm|ogg|ts)([?#]|$)/i;
        if (directExtensions.test(url)) return 'native';

        const iframeSources = [
            'youtube.com', 'vimeo.com', 'vimeus.com', 
            'facebook.com', 'ok.ru', 'upstream', 
            'mixdrop', '/e/', 'embed'
        ];
        
        if (iframeSources.some(src => url.includes(src))) return 'iframe';
        
        return 'iframe'; // Fallback por defecto
    },

    /**
     * Limpia el estado del reproductor actual.
     */
    destroy() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        this.stopProgressTracking();
    },

    /**
     * Inicia el rastreo de progreso en la base de datos.
     */
    startProgressTracking(tmdbId, type, getSeconds, season = 0, episode = 0) {
        this.stopProgressTracking();
        
        const profile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
        if (!profile) return;

        console.log(`[StreamService] Rastreo iniciado para ${tmdbId}`);

        this.progressInterval = setInterval(async () => {
            const seconds = Math.floor(getSeconds());
            if (seconds <= 0) return;

            // Actualizar estado local para Handover
            window.VIVOTV_VIEWING_STATUS = {
                tmdb_id: tmdbId,
                progress: seconds,
                type: type,
                season: season,
                episode: episode,
                updated_at: new Date().toISOString()
            };

            // Guardar en Watch History (Supabase)
            // Nota: Aquí se podría optimizar para guardar cada 30s o al pausar
            try {
                await supabase.from('watch_history').upsert({
                    profile_id: profile.id,
                    tmdb_id: Number(tmdbId),
                    type: type,
                    season_number: season,
                    episode_number: episode,
                    progress_seconds: seconds,
                    last_watched_at: new Date().toISOString()
                }, { onConflict: 'profile_id, tmdb_id, season_number, episode_number' });
            } catch (e) {
                console.warn('[StreamService] Error guardando progreso:', e);
            }
        }, 15000); // Cada 15 segundos
    },

    /**
     * Detiene el rastreo.
     */
    stopProgressTracking() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    },

    /**
     * Obtiene el progreso guardado.
     */
    async getSavedProgress(tmdbId, type, season = 0, episode = 0) {
        const profile = JSON.parse(localStorage.getItem('vivotv_current_profile'));
        if (!profile) return 0;

        const { data, error } = await supabase.from('watch_history')
            .select('progress_seconds')
            .eq('profile_id', profile.id)
            .eq('tmdb_id', Number(tmdbId))
            .eq('type', type)
            .eq('season_number', season)
            .eq('episode_number', episode)
            .maybeSingle();

        return data?.progress_seconds || 0;
    },

    /**
     * Formatea tiempo de segundos a string.
     */
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        let res = '';
        if (hrs > 0) res += (hrs < 10 ? '0' + hrs : hrs) + ':';
        res += (mins < 10 ? '0' + mins : mins) + ':';
        res += (secs < 10 ? '0' + secs : secs);
        return res;
    }
};
