// CONFIGURACIÓN CENTRALIZADA (Supabase / TMDB)
export const CONFIG = {
    // Configuración Supabase (Pública por diseño, protegida por RLS)
    SUPABASE_URL: 'https://esnrgviozjfjgnbcrduz.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzbnJndmlvempmamduYmNyZHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTUyNzYsImV4cCI6MjA4OTk3MTI3Nn0._a6k7-91c8u8YOKLW53Y-gza22qAclH1nTGM4hL_wRM',

    // Configuración TMDB (Segura vía Proxy Serverless en Vercel)
    TMDB_PROXY_URL: '/api/tmdb', 
    TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/original',
    TMDB_IMAGE_CARD: 'https://image.tmdb.org/t/p/w342',
    TMDB_IMAGE_HERO: 'https://image.tmdb.org/t/p/w1280',

    // Detección estricta de entorno: Usar proxy siempre que no estemos en local absoluto
    get USE_PROXY() {
        const h = window.location.hostname;
        const isLocal = h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.');
        // En Vercel (cualquier dominio .vercel.app o dominio propio), el proxy es obligatorio.
        // En local, el proxy /api/tmdb no existe bajo Live Server (404), por lo que usamos llamada directa.
        return !isLocal; 
    },
    TMDB_API_KEY: '743275e25bcea0a320b87d2af271a136', // Fallback para desarrollo local (sacada de Flutter)
    
    // SEGURIDAD: Control de logs en consola
    DEBUG: false
};

// ---- MOTOR DE SEGURIDAD (Consola Limpia) ----
// Se ejecuta inmediatamente para silenciar logs de otros módulos
if (!CONFIG.DEBUG) {
    const noop = () => {};
    console.log = noop;
    console.debug = noop;
    console.info = noop;
    console.warn = noop; 
}

// Funciones globales seguras
window.logDebug = (msg) => { if (CONFIG.DEBUG) console.debug(`[DEBUG] ${msg}`); };
window.fatalLog = (msg) => { if (CONFIG.DEBUG) console.error(`💥 ${msg}`); };

// Instancia Única de Supabase (Importar desde aquí, no usar window)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
