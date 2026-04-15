/**
 * live-engine.js — Motor de Programación Simultánea (Simulcast)
 * Calcula qué contenido debe reproducirse en base a la hora UTC real.
 */

const GENRE_MAP = {
    risa: [35], // Comedia
    action: [28, 12], // Acción, Aventura
    horror: [27, 53, 9648], // Terror, Suspenso, Misterio
    anime: [16], // Animación (Anime se filtra por esto + origen en catalog.js)
    family: [10751, 10762, 16] // Familia, Kids, Animación
};

export const LIVE_CHANNELS = [
    { id: 'risa', name: 'Vivo Risa', icon: '😄', color: '#facc15', genreIds: GENRE_MAP.risa },
    { id: 'action', name: 'Vivo Acción', icon: '💥', color: '#ef4444', genreIds: GENRE_MAP.action },
    { id: 'horror', name: 'Vivo Terror', icon: '👻', color: '#7c3aed', genreIds: GENRE_MAP.horror },
    { id: 'anime', name: 'Anime 24/7', icon: '🍥', color: '#f97316', genreIds: GENRE_MAP.anime },
    { id: 'family', name: 'Vivo Familiar', icon: '🌈', color: '#22c55e', genreIds: GENRE_MAP.family }
];

let generatedSchedules = {};
let cachedDbCatalog = [];

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
            duration: runtime,
            genreIds: item.genres || item.genre_ids || []
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
            
            const durationSeconds = item.duration || 7200;
            currentShow.offsetSeconds = currentTimeInSeconds - showTimeSeconds;
            currentShow.durationSeconds = durationSeconds;
            currentShow.progress = Math.min((currentShow.offsetSeconds / durationSeconds) * 100, 100);
        } else if (!currentShow) {
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

/**
 * Busca contenido similar que SÍ esté en la base de datos si falla el original.
 */
export function findSimilarAvailable(genreIds) {
    if (!cachedDbCatalog || cachedDbCatalog.length === 0) return null;

    // Normalizar genreIds
    const targetGenres = (genreIds || []).map(g => typeof g === 'object' ? g.id : g);
    
    // Buscar items con al menos un género en común
    const similar = cachedDbCatalog.filter(item => {
        const itemGenres = (item.genres || item.genre_ids || []).map(g => typeof g === 'object' ? g.id : g);
        return targetGenres.some(id => itemGenres.includes(id));
    });

    if (similar.length > 0) {
        return similar[Math.floor(Math.random() * similar.length)];
    }

    // Fallback absoluto: cualquier cosa
    return cachedDbCatalog[Math.floor(Math.random() * cachedDbCatalog.length)];
}

export async function buildLiveCatalog(dbCatalog) {
    if (!dbCatalog || dbCatalog.length === 0) {
        console.warn('[Live] buildLiveCatalog: Catálogo vacío, reintentando...');
        return;
    }

    cachedDbCatalog = dbCatalog;
    console.log(`[Live] Generando programación para ${LIVE_CHANNELS.length} canales...`);
    
    const today = new Date().toISOString().split('T')[0];
    const dateSeed = parseInt(today.replace(/-/g, ''));

    LIVE_CHANNELS.forEach(channel => {
        let matching = dbCatalog.filter(item => {
            const genres = item.genres || item.genre_ids || [];
            const genreIds = genres.map(g => typeof g === 'object' ? g.id : g);
            return channel.genreIds.some(id => genreIds.includes(id));
        });

        // FALLBACK: Si no hay hits para este género, usar el catálogo completo (Sin señal -> Señal aleatoria)
        if (matching.length === 0) {
            console.log(`[Live] Canal '${channel.name}' sin contenido. Usando pool general.`);
            matching = dbCatalog.slice(0, 50); // Tomar una muestra
        }
        
        generatedSchedules[channel.id] = generateDailySchedule(matching, dateSeed);
    });
}
