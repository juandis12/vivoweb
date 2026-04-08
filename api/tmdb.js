// Función Serverless para Vercel (Node.js 18+)
// Este archivo actúa como un proxy para ocultar la TMDB_API_KEY
export default async function handler(req, res) {
    const { path, ...params } = req.query;
    
    // Configurar CORS básico
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // SEGURIDAD: Validación Estricta de Origen (CORS whitelist)
    const reqOrigin = req.headers.referer || req.headers.origin;
    if (req.method !== 'OPTIONS') {
        if (!reqOrigin) {
            return res.status(403).json({ error: 'Bloqueado: Falta cabecera de Origen.' });
        }
        try {
            const hostname = new URL(reqOrigin).hostname;
            // Autorizados: Localhost y tus dominios de prod (ej. miservidor-vivoweb.vercel.app)
            const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
            const extendsVivoweb = hostname.includes('vivoweb'); // Si usas Vercel con ramas automáticas
            
            if (!isLocal && !extendsVivoweb) {
                console.warn('🛡️ CORS Bloqueado para hostname:', hostname);
                return res.status(403).json({ error: 'Acceso no autorizado (CORS estricto).' });
            }
        } catch(e) {
            return res.status(403).json({ error: 'Origen inválido.' });
        }
    }

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!path) {
        return res.status(400).json({ error: 'Missing path parameter' });
    }

    const API_KEY = process.env.TMDB_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ 
            error: 'TMDB_API_KEY no configurada en Vercel',
            tip: 'Debes añadir TMDB_API_KEY en el panel de Vercel > Settings > Environment Variables'
        });
    }

    // Construir la URL de TMDB
    const baseUrl = 'https://api.themoviedb.org/3';
    const queryParams = new URLSearchParams({
        api_key: API_KEY,
        language: 'es-ES',
        ...params
    });

    try {
        const tmdbUrl = `${baseUrl}/${path}?${queryParams}`;
        const response = await fetch(tmdbUrl);
        const data = await response.json();
        
        return res.status(response.status).json(data);
    } catch (error) {
        console.error('Proxy Error:', error);
        return res.status(500).json({ error: 'Fallo al conectar con TMDB', details: error.message });
    }
}
