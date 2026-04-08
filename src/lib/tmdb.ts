// Servicio Centralizado TMDB Server-Side SSR
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/original';
export const TMDB_IMAGE_CARD = 'https://image.tmdb.org/t/p/w342';

/**
 * Fetch genrico para TMDB con revalidacin de Next.js
 */
export async function fetchTMDB(endpoint: string, params: Record<string, string> = {}) {
  if (!TMDB_API_KEY) {
    console.error('TMDB_API_KEY no configurado.');
    return null;
  }

  const queryParams = new URLSearchParams({
    api_key: TMDB_API_KEY,
    language: 'es-MX',
    ...params,
  });

  try {
    const url = `${BASE_URL}${endpoint}?${queryParams.toString()}`;
    const response = await fetch(url, { next: { revalidate: 3600 } }); 
    if (!response.ok) throw new Error(`TMDB Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error(`[TMDB Service] Error en ${endpoint}:`, error);
    return null;
  }
}

/**
 * Obtener Pelculas o Series Populares
 */
export async function getPopular(type: 'movie' | 'tv' = 'movie') {
  const data = await fetchTMDB(`/${type}/popular`);
  return data?.results || [];
}

/**
 * Obtener Mejor Valorados
 */
export async function getTopRated(type: 'movie' | 'tv' = 'movie') {
  const data = await fetchTMDB(`/${type}/top_rated`);
  return data?.results || [];
}

/**
 * Obtener Tendencias de la Semana
 */
export async function getTrending(type: 'movie' | 'tv' | 'all' = 'all') {
  const data = await fetchTMDB(`/trending/${type}/week`);
  return data?.results || [];
}

/**
 * Buscador Multi-Contenido
 */
export async function searchContent(query: string, page = '1') {
  return fetchTMDB('/search/multi', {
    query,
    page,
    include_adult: 'false'
  });
}
