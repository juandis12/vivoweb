// Este archivo concentra las constantes que cambian según el entorno (Supabase / TMDB)
export const CONFIG = {
    // Configuración Base de Datos Supabase (Donde reside auth y el mapeo de vídeo)
    SUPABASE_URL: 'https://esnrgviozjfjgnbcrduz.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_-Nf_ORrYzMgPrE3WPPP8MQ_0T7pjOS6',

    // Configuración API TMDB (Catálogo Gratuito de Metadatos)
    TMDB_API_KEY: '743275e25bcea0a320b87d2af271a136',
    TMDB_BASE_URL: 'https://api.themoviedb.org/3',
    TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/original', // Para el Hero Canvas
    TMDB_IMAGE_CARD: 'https://image.tmdb.org/t/p/w500' // Para los Carruseles (eficiencia en peso)
};
