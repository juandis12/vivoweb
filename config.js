// CONFIGURACIÓN CENTRALIZADA (Supabase / TMDB)
export const CONFIG = {
    // Configuración Supabase (Pública por diseño, protegida por RLS)
    SUPABASE_URL: 'https://esnrgviozjfjgnbcrduz.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzbnJndmlvempmamduYmNyZHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTUyNzYsImV4cCI6MjA4OTk3MTI3Nn0._a6k7-91c8u8YOKLW53Y-gza22qAclH1nTGM4hL_wRM',

    // Configuración TMDB (Segura vía Proxy Serverless)
    TMDB_PROXY_URL: '/api/tmdb', // Todas las peticiones deben pasar por aquí en producción
    TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/original',
    TMDB_IMAGE_CARD: 'https://image.tmdb.org/t/p/w342',
    TMDB_IMAGE_HERO: 'https://image.tmdb.org/t/p/w1280',

    // LLAVE TEMPORAL (Se recomienda mover a un Backend Proxy)
    get _tk() {
        return '743275e25bcea0a320b87d2af271a136';
    },

    // Detección estricta de entorno: Forzar Proxy en cualquier dominio que no sea local
    get USE_PROXY() {
        const h = window.location.hostname;
        const isLocal = h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.') || window.location.protocol === 'file:';
        return !isLocal;
    }
};

// Instancia Única de Supabase (Importar desde aquí, no usar window)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
