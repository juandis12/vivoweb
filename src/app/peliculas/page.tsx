import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, getPopular, getTopRated, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import ClientCatalog from '@/components/ClientCatalog';
import MeshBackground from '@/components/MeshBackground';

export const revalidate = 3600;

export default async function PeliculasPage() {
  const supabase = await createClient();
  
  // 1. Fetch available movies from our legacy DB tables (video_sources)
  const { data: moviesRes } = await supabase.from('video_sources').select('tmdb_id, stream_url');
  const availableIds = new Set<string>(moviesRes?.map((item: any) => item.tmdb_id.toString()) || []);
  const sourceMap = new Map<string, string>((moviesRes || []).map((item: any) => [item.tmdb_id.toString(), item.stream_url]));

  // 2. Fetch TMDB Data with Parity
  const [popRaw, topRaw, actionRaw, comedyRaw] = await Promise.all([
    getPopular('movie'),
    getTopRated('movie'),
    fetchTMDB('/discover/movie', { with_genres: '28' }), // Action
    fetchTMDB('/discover/movie', { with_genres: '35' })  // Comedy
  ]);

  const mapItem = (item: any) => ({
    id: item.id.toString(),
    tmdb_id: item.id.toString(),
    title: item.title,
    overview: item.overview,
    backdrop_path: item.backdrop_path,
    poster_path: item.poster_path ? `${TMDB_IMAGE_CARD}${item.poster_path}` : null,
    source_url: sourceMap.get(item.id.toString()) || '',
    type: 'movie' as const,
    genre_ids: item.genre_ids || []
  });

  const filterAvail = (res: any) => {
    const results = res.results || res || [];
    return results.filter((item: any) => availableIds.has(item.id.toString())).map(mapItem);
  };

  return (
    <main className="dashboard-container relative min-h-screen">
      <MeshBackground />
      <ClientCatalog 
        initialPopular={filterAvail(popRaw)}
        initialTopRated={filterAvail(topRaw)}
        initialGenre1={filterAvail(actionRaw)}
        initialGenre2={filterAvail(comedyRaw)}
        title="Películas"
        type="movie"
      />
    </main>
  );
}
