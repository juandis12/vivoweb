/**
 * live-engine.js — Motor de Programación Simultánea (Simulcast)
 * Calcula qué contenido debe reproducirse en base a la hora UTC real.
 */

export const LIVE_CHANNELS = [
    {
        id: 'action',
        name: 'Vivo Acción',
        icon: '💥',
        color: '#ef4444',
        schedule: [
            { time: '00:00', tmdb_id: '299534', title: 'Avengers: Endgame', type: 'movie' },
            { time: '03:00', tmdb_id: '671', title: 'Harry Potter y la Piedra Filosofal', type: 'movie' },
            { time: '05:30', tmdb_id: '157336', title: 'Interstellar', type: 'movie' },
            { time: '08:00', tmdb_id: '27205', title: 'Inception', type: 'movie' },
            { time: '11:00', tmdb_id: '155', title: 'The Dark Knight', type: 'movie' },
            { time: '14:00', tmdb_id: '603', title: 'The Matrix', type: 'movie' },
            { time: '17:00', tmdb_id: '24428', title: 'The Avengers', type: 'movie' },
            { time: '20:00', tmdb_id: '299536', title: 'Avengers: Infinity War', type: 'movie' }, // Estreno Night
            { time: '22:30', tmdb_id: '19995', title: 'Avatar', type: 'movie' }
        ]
    },
    {
        id: 'horror',
        name: 'Vivo Terror',
        icon: '👻',
        color: '#7c3aed',
        schedule: [
            { time: '00:00', tmdb_id: '135335', title: 'El Conjuro', type: 'movie' },
            { time: '02:30', tmdb_id: '138843', title: 'El Conjuro 2', type: 'movie' },
            { time: '05:00', tmdb_id: '420634', title: 'Inhereditary', type: 'movie' },
            { time: '07:30', tmdb_id: '259693', title: 'The Nun', type: 'movie' },
            { time: '10:00', tmdb_id: '350312', title: 'Anabelle', type: 'movie' },
            { time: '12:30', tmdb_id: '447332', title: 'A Quiet Place', type: 'movie' },
            { time: '15:00', tmdb_id: '419430', title: 'Get Out', type: 'movie' },
            { time: '18:00', tmdb_id: '135335', title: 'El Conjuro', type: 'movie' },
            { time: '20:00', tmdb_id: '351286', title: 'It (2017)', type: 'movie' }, // Horror Night
            { time: '23:00', tmdb_id: '442249', title: 'The First Purge', type: 'movie' }
        ]
    },
    {
        id: 'anime',
        name: 'Anime 24/7',
        icon: '🍥',
        color: '#f97316',
        schedule: [
            { time: '00:00', tmdb_id: '37854', title: 'Your Name', type: 'movie' },
            { time: '02:30', tmdb_id: '129', title: 'El Viaje de Chihiro', type: 'movie' },
            { time: '05:20', tmdb_id: '4935', title: 'Akira', type: 'movie' },
            { time: '08:00', tmdb_id: '92321', title: 'A Silent Voice', type: 'movie' },
            { time: '10:30', tmdb_id: '496243', title: 'Parasite (Serie Context)', type: 'tv' },
            { time: '13:00', tmdb_id: '46260', title: 'Fullmetal Alchemist: B', type: 'tv' },
            { time: '16:00', tmdb_id: '16109', title: 'Death Note', type: 'tv' },
            { time: '18:30', tmdb_id: '60625', title: 'Attack on Titan', type: 'tv' },
            { time: '20:00', tmdb_id: '209867', title: 'Demon Slayer: Mugen Train', type: 'movie' },
            { time: '22:30', tmdb_id: '46838', title: 'Naruto: The Last', type: 'movie' }
        ]
    },
    {
        id: 'family',
        name: 'Vivo Familiar',
        icon: '🌈',
        color: '#22c55e',
        schedule: [
            { time: '00:00', tmdb_id: '12', title: 'Buscando a Nemo', type: 'movie' },
            { time: '02:00', tmdb_id: '808', title: 'Shrek', type: 'movie' },
            { time: '04:00', tmdb_id: '10191', title: 'How to Train Your Dragon', type: 'movie' },
            { time: '06:00', tmdb_id: '211672', title: 'Minions', type: 'movie' },
            { time: '08:00', tmdb_id: '862', title: 'Toy Story', type: 'movie' },
            { time: '10:30', tmdb_id: '12758', title: 'The Incredibles', type: 'movie' },
            { time: '13:00', tmdb_id: '9502', title: 'Kung Fu Panda', type: 'movie' },
            { time: '15:30', tmdb_id: '269149', title: 'Zootopia', type: 'movie' },
            { time: '18:00', tmdb_id: '502356', title: 'Super Mario Bros Movie', type: 'movie' },
            { time: '20:00', tmdb_id: '1022789', title: 'Inside Out 2', type: 'movie' },
            { time: '22:30', tmdb_id: '118340', title: 'Guardians of the Galaxy (Family Friendly)', type: 'movie' }
        ]
    }
];

export function getCurrentShow(channelId) {
    const channel = LIVE_CHANNELS.find(c => c.id === channelId);
    if (!channel) return null;

    const now = new Date();
    const currentTimeInSeconds = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();

    let currentShow = channel.schedule[0];
    let nextShow = channel.schedule[1];

    for (let i = 0; i < channel.schedule.length; i++) {
        const item = channel.schedule[i];
        const [h, m] = item.time.split(':').map(Number);
        const showTimeSeconds = (h * 3600) + (m * 60);

        if (showTimeSeconds <= currentTimeInSeconds) {
            currentShow = item;
            nextShow = channel.schedule[i+1] || channel.schedule[0];
            currentShow.offsetSeconds = currentTimeInSeconds - showTimeSeconds;
        } else {
            break;
        }
    }

    return { currentShow, nextShow };
}
