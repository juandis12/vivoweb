// Función Serverless para Vercel (Node.js 18+)
// Este archivo actúa como un proxy para ocultar la TMDB_API_KEY
export default async function handler(req, res) {
    const { path, ...params } = req.query;
    
    // Configurar CORS básico
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // SEGURIDAD: Validar Referer (Opcional pero recomendado)
    const referer = req.headers.referer || '';
    const allowedHost = 'vivoweb'; // Ajusta esto según tu dominio en producción
    if (req.method !== 'OPTIONS' && !referer.includes(allowedHost) && !referer.includes('localhost') && !referer.includes('127.0.0.1')) {
        // En desarrollo permitimos localhost, en producción solo tu dominio
        console.warn('Bloqueado por Referer:', referer);
        // return res.status(403).json({ error: 'Acceso no autorizado' });
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
