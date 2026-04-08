import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, getPopular, getTopRated, getTrending, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import ClientDashboard from '@/components/ClientDashboard';
import MeshBackground from '@/components/MeshBackground';

export const revalidate = 3600;

export default async function HomePage() {
  const supabase = await createClient();
  
  // 1. Fetch available content from our database (to ensure we only show what we have streams for)
  const [moviesRes, seriesRes] = await Promise.all([
    supabase.from('video_sources').select('tmdb_id, stream_url'),
    supabase.from('series_episodes').select('tmdb_id, stream_url')
  ]);
  
  const movieSources = moviesRes.data || [];
  const seriesSources = seriesRes.data || [];
  const availableIds = new Set([
    ...movieSources.map(m => m.tmdb_id.toString()),
    ...seriesSources.map(s => s.tmdb_id.toString())
  ]);

  const sourceMap = new Map();
  movieSources.forEach(m => sourceMap.set(m.tmdb_id.toString(), { url: m.stream_url, type: 'movie' }));
  seriesSources.forEach(s => sourceMap.set(s.tmdb_id.toString(), { url: s.stream_url, type: 'series' }));

  // 2. Fetch TMDB Data
  const [trendingRaw, popMoviesRaw, popTVRaw, topRatedRaw] = await Promise.all([
    getTrending('all'),
    getPopular('movie'),
    getPopular('tv'),
    getTopRated('movie')
  ]);

  // 3. Map and Filter by Availability
  const mapItem = (item: any) => ({
    id: item.id.toString(),
    tmdb_id: item.id.toString(),
    title: item.title || item.name,
    overview: item.overview,
    backdrop_path: item.backdrop_path,
    poster_path: item.poster_path ? `${TMDB_IMAGE_CARD}${item.poster_path}` : null,
    source_url: sourceMap.get(item.id.toString())?.url || '',
    type: sourceMap.get(item.id.toString())?.type || (item.media_type === 'tv' ? 'series' : 'movie'),
    genre_ids: item.genre_ids || []
  });

  const filterAvail = (items: any[]) => 
    (items || []).filter(item => availableIds.has(item.id.toString())).map(mapItem);

  const initialTrending = filterAvail(trendingRaw);
  const initialPopularMovies = filterAvail(popMoviesRaw);
  const initialPopularSeries = filterAvail(popTVRaw);
  const initialTopRated = filterAvail(topRatedRaw);

  // 4. Fetch Watch History (Server Side for SEO/Initial Load)
  const { data: { user } } = await supabase.auth.getUser();
  let initialHistory: any[] = [];
  
  if (user) {
    // Note: in a real scenario we'd need the profile_id here, 
    // but since this is SSR and profile is in sessionStorage, 
    // we'll fetch general history for the user and the ClientDashboard will filter by profile_id if needed, 
    // or we can fetch all and let client handle it.
    const { data: historyData } = await supabase
      .from('watch_history')
      .select('*')
      .eq('user_id', user.id)
      .order('last_watched', { ascending: false })
      .limit(15);

    if (historyData) {
      const detailedHistory = await Promise.all(
        historyData.map(async (h) => {
          const type = h.type === 'movie' ? 'movie' : 'tv';
          const details = await fetchTMDB(`/${type}/${h.tmdb_id}`);
          if (!details) return null;
          return {
            ...mapItem(details),
            profile_id: h.profile_id,
            label: `Visto ${Math.floor(h.progress_seconds / 60)} min`
          };
        })
      );
      initialHistory = detailedHistory.filter(i => i !== null);
    }
  }

  return (
    <main className="dashboard-container relative min-h-screen">
      <MeshBackground />
      
      <ClientDashboard 
        initialTrending={initialTrending}
        initialPopularMovies={initialPopularMovies}
        initialPopularSeries={initialPopularSeries}
        initialTopRated={initialTopRated}
        initialHistory={initialHistory}
      />
    </main>
  );
}
