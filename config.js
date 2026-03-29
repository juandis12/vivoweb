// CONFIGURACIÓN CENTRALIZADA (Supabase / TMDB)
export const CONFIG = {
    // Configuración Supabase (Pública por diseño, protegida por RLS)
    SUPABASE_URL: 'https://esnrgviozjfjgnbcrduz.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_-Nf_ORrYzMgPrE3WPPP8MQ_0T7pjOS6',

    // Configuración TMDB (Segura vía Proxy Serverless)
    TMDB_PROXY_URL: '/api/tmdb', // Todas las peticiones deben pasar por aquí
    TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/original',
    TMDB_IMAGE_CARD: 'https://image.tmdb.org/t/p/w500',
    // Llave de desarrollo local (oculta solo para evitar bots básicos, real security en Prod)
    _tk: 'YmJiY2YwZjhjYmU0MGYzYjUyMTgzNWY0ZWYyNTU1OGU=',

    // Detección automática de entorno: Proxy en Prod, Directo en Local (Live Server)
    USE_PROXY: (
        window.location.hostname !== 'localhost' && 
        window.location.hostname !== '127.0.0.1' && 
        !window.location.hostname.startsWith('192.168.') &&
        !window.location.hostname.startsWith('10.') &&
        !window.location.hostname.endsWith('.local') &&
        window.location.protocol !== 'file:'
    )
};
