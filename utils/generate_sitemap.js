/**
 * VIVOTV | Generador de Sitemap Dinámico (SEO Turbo 10X)
 * Este script consulta Supabase y genera un sitemap.xml completo incluyendo
 * todas las películas, series y anime para maximizar la indexación en Google.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://esnrgviozjfjgnbcrduz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzbnJndmlvempmamduYmNyZHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTUyNzYsImV4cCI6MjA4OTk3MTI3Nn0._a6k7-91c8u8YOKLW53Y-gza22qAclH1nTGM4hL_wRM';
const BASE_URL = 'https://vivoweb-liart.vercel.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function generateSitemap() {
    console.log('[SEO] 🚀 Iniciando generación de sitemap dinámico...');
    
    const staticPages = [
        '',
        '/peliculas.html',
        '/series.html',
        '/anime.html',
        '/live.html'
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // 1. Añadir páginas estáticas
    staticPages.forEach(page => {
        xml += `  <url>\n    <loc>${BASE_URL}${page}</loc>\n    <changefreq>daily</changefreq>\n    <priority>${page === '' ? '1.0' : '0.8'}</priority>\n  </url>\n`;
    });

    // 2. Añadir Películas desde la DB
    const { data: movies } = await supabase.from('video_sources').select('tmdb_id, title');
    if (movies) {
        movies.forEach(m => {
            const slug = (m.title || 'pelicula').toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
            xml += `  <url>\n    <loc>${BASE_URL}/ver/${m.tmdb_id}-${slug}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
        });
    }

    xml += `</urlset>`;
    
    // En un entorno real, esto se guardaría en el sistema de archivos.
    // Para esta demo, lo imprimimos en consola o lo descargamos.
    console.log('[SEO] ✅ Sitemap generado con éxito.');
    return xml;
}

// Para ejecutar en consola del navegador y copiar el resultado:
// generateSitemap().then(console.log);
