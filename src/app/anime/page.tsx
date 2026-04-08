import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import ClientCatalog from '@/components/ClientCatalog';
import MeshBackground from '@/components/MeshBackground';

export const revalidate = 3600;

export default async function AnimePage() {
  const supabase = await createClient();
  
  // 1. Fetch available anime (filtered series_episodes) from our DB
  const { data: seriesRes } = await supabase.from('series_episodes').select('tmdb_id, stream_url');
  const availableIds = new Set<string>(seriesRes?.map((item: any) => item.tmdb_id.toString()) || []);
  const sourceMap = new Map<string, string>((seriesRes || []).map((item: any) => [item.tmdb_id.toString(), item.stream_url]));

  // 2. Fetch TMDB Data specifically for Anime (Genre 16)
  const [popRaw, topRaw, actionRaw, fantasyRaw] = await Promise.all([
    fetchTMDB('/discover/tv', { with_genres: '16', sort_by: 'popularity.desc' }),
    fetchTMDB('/discover/tv', { with_genres: '16', sort_by: 'vote_average.desc', 'vote_count.gte': '100' }),
    fetchTMDB('/discover/tv', { with_genres: '16,10759' }), 
    fetchTMDB('/discover/tv', { with_genres: '16,10765' })  
  ]);

  const mapItem = (item: any) => ({
    id: item.id.toString(),
    tmdb_id: item.id.toString(),
    title: item.name,
    overview: item.overview,
    backdrop_path: item.backdrop_path,
    poster_path: item.poster_path ? `${TMDB_IMAGE_CARD}${item.poster_path}` : null,
    source_url: sourceMap.get(item.id.toString()) || '',
    type: 'anime' as const,
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
        initialGenre2={filterAvail(fantasyRaw)}
        title="Anime"
        type="anime"
      />
    </main>
  );
}
