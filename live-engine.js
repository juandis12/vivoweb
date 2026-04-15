/**
 * live-engine.js — Motor de Programación Simultánea (Simulcast)
 * Calcula qué contenido debe reproducirse en base a la hora UTC real.
 */

const GENRE_MAP = {
    action: [28],
    horror: [27],
    anime: [16],
    family: [10751, 10762]
};

export const LIVE_CHANNELS = [
    { id: 'action', name: 'Vivo Acción', icon: '💥', color: '#ef4444', genreIds: GENRE_MAP.action },
    { id: 'horror', name: 'Vivo Terror', icon: '👻', color: '#7c3aed', genreIds: GENRE_MAP.horror },
    { id: 'anime', name: 'Anime 24/7', icon: '🍥', color: '#f97316', genreIds: GENRE_MAP.anime },
    { id: 'family', name: 'Vivo Familiar', icon: '🌈', color: '#22c55e', genreIds: GENRE_MAP.family }
];

let generatedSchedules = {};

/**
 * Genera una programación de 24 horas usando una lista de películas.
 */
function generateDailySchedule(movies, dateSeed) {
    if (!movies || movies.length === 0) return [];

    const rng = seedRandom(dateSeed);
    let shuffled = [...movies].sort(() => rng() - 0.5);
    
    let schedule = [];
    let currentSeconds = 0;
    const SECONDS_IN_DAY = 24 * 3600;
    
    let i = 0;
    while (currentSeconds < SECONDS_IN_DAY) {
        const item = shuffled[i % shuffled.length];
        const runtime = (item.runtime || 120) * 60;
        
        const h = Math.floor(currentSeconds / 3600);
        const m = Math.floor((currentSeconds % 3600) / 60);
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        
        schedule.push({
            time: timeStr,
            tmdb_id: String(item.id || item.tmdb_id),
            title: item.title || item.name,
            type: item.title ? 'movie' : 'tv',
            duration: runtime
        });
        
        currentSeconds += runtime;
        i++;
    }
    return schedule;
}

function seedRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return () => x - Math.floor(x);
}

export function getCurrentShow(channelId) {
    const channel = LIVE_CHANNELS.find(c => c.id === channelId);
    if (!channel) return null;

    const schedule = generatedSchedules[channelId] || [];
    if (schedule.length === 0) return null;

    const now = new Date();
    // Usamos UTC para síncronía global absoluta
    const currentTimeInSeconds = (now.getUTCHours() * 3600) + (now.getUTCMinutes() * 60) + now.getUTCSeconds();

    let currentShow = null;
    let nextShow = null;

    for (let i = 0; i < schedule.length; i++) {
        const item = schedule[i];
        const [h, m] = item.time.split(':').map(Number);
        const showTimeSeconds = (h * 3600) + (m * 60);

        if (showTimeSeconds <= currentTimeInSeconds) {
            currentShow = { ...item };
            const nextItem = schedule[i+1] || schedule[0];
            nextShow = { ...nextItem };
            
            // Calculamos duración basada en el item
            const durationSeconds = item.duration || 7200;

            currentShow.offsetSeconds = currentTimeInSeconds - showTimeSeconds;
            currentShow.durationSeconds = durationSeconds;
            currentShow.progress = Math.min((currentShow.offsetSeconds / durationSeconds) * 100, 100);
        } else if (!currentShow) {
            // Caso borde: antes de la primera función del día
            const lastItem = schedule[schedule.length - 1];
            currentShow = { ...lastItem };
            nextShow = { ...schedule[0] };
            
            const [lh, lm] = lastItem.time.split(':').map(Number);
            const lastTimeSeconds = (lh * 3600) + (lm * 60);
            
            currentShow.offsetSeconds = (currentTimeInSeconds + (24 * 3600)) - lastTimeSeconds;
            currentShow.durationSeconds = lastItem.duration || 7200;
            currentShow.progress = Math.min((currentShow.offsetSeconds / currentShow.durationSeconds) * 100, 100);
            break;
        } else {
            break;
        }
    }

    return { currentShow, nextShow };
}

export async function buildLiveCatalog(dbCatalog) {
    console.log('[Live] Construyendo programación 24/7 dinámica...');
    const today = new Date().toISOString().split('T')[0];
    const dateSeed = parseInt(today.replace(/-/g, ''));

    LIVE_CHANNELS.forEach(channel => {
        const matching = dbCatalog.filter(item => {
            const genres = item.genres || item.genre_ids || [];
            const genreIds = genres.map(g => typeof g === 'object' ? g.id : g);
            return channel.genreIds.some(id => genreIds.includes(id));
        });
        
        generatedSchedules[channel.id] = generateDailySchedule(matching, dateSeed);
    });
}
