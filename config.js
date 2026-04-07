// CONFIGURACIÓN CENTRALIZADA (Supabase / TMDB)
export const CONFIG = {
    // Configuración Supabase (Pública por diseño, protegida por RLS)
    SUPABASE_URL: 'https://esnrgviozjfjgnbcrduz.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_-Nf_ORrYzMgPrE3WPPP8MQ_0T7pjOS6',

    // Configuración TMDB (Segura vía Proxy Serverless)
    TMDB_PROXY_URL: '/api/tmdb', // Todas las peticiones deben pasar por aquí
    TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/original',
    TMDB_IMAGE_CARD: 'https://image.tmdb.org/t/p/w342',
    TMDB_IMAGE_HERO: 'https://image.tmdb.org/t/p/w1280',

    // OFUSCACIÓN DE LLAVE (XOR Shield - Fase 3 Corregida)
    get _tk() {
        const _s = [110, 109, 108, 111, 110, 101, 111, 98, 101, 122, 108, 111, 110, 101, 108, 122, 100, 111, 101, 111, 103, 111, 110, 122, 101, 108, 122, 103, 110, 122, 108, 103];
        return _s.map(c => String.fromCharCode(c ^ 0x61)).join('').toLowerCase();
    },

    // Detección automática de entorno: Proxy en Prod, Directo en Local (Live Server)
    USE_PROXY: (
        window.location.hostname !== 'localhost' && 
        window.location.hostname !== '127.0.0.1' && 
        !window.location.hostname.startsWith('192.168.') &&
        window.location.protocol !== 'file:'
    )
};
