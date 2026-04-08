// Servicio Centralizado TMDB Server-Side SSR
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/original';
export const TMDB_IMAGE_CARD = 'https://image.tmdb.org/t/p/w342';

// 1. Ocultar el API KEY en el Servidor (Ventaja de Next.js)
export async function fetchTMDB(endpoint: string, params: Record<string, string> = {}) {
  if (!TMDB_API_KEY) {
    console.error('TMDB_API_KEY no configurado en entorno.');
    return null;
  }

  const queryParams = new URLSearchParams({
    api_key: TMDB_API_KEY,
    language: 'es-MX',
    ...params,
  });

  try {
    // Next.js Cache Behavior (Revalidación ISR)
    const url = `${BASE_URL}${endpoint}?${queryParams.toString()}`;
    const response = await fetch(url, { next: { revalidate: 3600 } }); 

    if (!response.ok) throw new Error(`TMDB Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error(`[TMDB Service] Fetch falló para ${endpoint}:`, error);
    return null;
  }
}

// 2. Patrón de Búsqueda Dedicado
export async function searchContent(query: string, page = '1') {
  return fetchTMDB('/search/multi', {
    query,
    page,
    include_adult: 'false'
  });
}
