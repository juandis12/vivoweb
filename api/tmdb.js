// Función Serverless para Vercel (Node.js)
// Este archivo actúa como un proxy para ocultar la TMDB_API_KEY
import fetch from 'node-fetch';

export default async function handler(req, res) {
    const { path, ...params } = req.query;
    
    if (!path) {
        return res.status(400).json({ error: 'Missing path parameter' });
    }

    const API_KEY = process.env.TMDB_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ error: 'TMDB_API_KEY not configured on server' });
    }

    // Construir la URL de TMDB
    const baseUrl = 'https://api.themoviedb.org/3';
    const queryParams = new URLSearchParams({
        api_key: API_KEY,
        ...params
    });

    try {
        const response = await fetch(`${baseUrl}/${path}?${queryParams}`);
        const data = await response.json();
        
        // Configurar CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        
        return res.status(response.status).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch from TMDB' });
    }
}
