// CONFIGURACIÓN CENTRALIZADA (Supabase / TMDB)
export const CONFIG = {
    // Configuración Supabase (Pública por diseño, protegida por RLS)
    SUPABASE_URL: 'https://esnrgviozjfjgnbcrduz.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_-Nf_ORrYzMgPrE3WPPP8MQ_0T7pjOS6',

    // Configuración TMDB (Segura vía Proxy en producción)
    TMDB_BASE_URL: 'https://api.themoviedb.org/3', // Se usará solo en local
    TMDB_PROXY_URL: '/api/tmdb', // Se usará en Vercel
    TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/original',
    TMDB_IMAGE_CARD: 'https://image.tmdb.org/t/p/w500',
    
    // Detección automática de entorno
    USE_PROXY: window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
};
