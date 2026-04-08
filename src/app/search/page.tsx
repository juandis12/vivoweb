import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';

interface MediaItem {
  id: string;
  tmdb_id: string;
  title: string;
  source_url: string;
  poster_path: string | null;
  type: 'movie' | 'series' | 'anime';
}

export default async function SearchResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q || '';

  if (!query) return <div className="pt-32 text-center opacity-50">Ingresa algo en el buscador...</div>;

  const supabase = await createClient();
  
  // Buscar en la tabla 'content' por t├¡tulo (mapeo real)
  const { data: rawResults, error } = await supabase
    .from('content')
    .select('*')
    .ilike('title', `%${query}%`)
    .limit(20);

  let catalog: MediaItem[] = [];

  if (rawResults && rawResults.length > 0) {
    catalog = await Promise.all(
      rawResults.map(async (item: any) => {
        let poster = null;
        try {
           const typeStr = item.content_type === 'movie' ? 'movie' : 'tv';
           const tmdbData = await fetchTMDB(`/${typeStr}/${item.tmdb_id}`);
           poster = tmdbData?.poster_path ? `${TMDB_IMAGE_CARD}${tmdbData.poster_path}` : null;
        } catch (e) {}

        return {
          id: item.id.toString(),
          tmdb_id: item.tmdb_id.toString(),
          title: item.title,
          source_url: item.video_url || '',
          poster_path: poster,
          type: item.content_type === 'movie' ? 'movie' : 'series'
        } as MediaItem;
      })
    );
  }

  return (
    <main className="pt-32 px-6 pb-24 max-w-7xl mx-auto">
      <h1 className="text-4xl font-black tracking-tighter mb-8 uppercase">
        Resultados para: <span className="text-primary">"{query}"</span>
      </h1>

      <Suspense fallback={<div className="h-40 animate-pulse bg-surface-container rounded-3xl" />}>
        {catalog.length > 0 ? (
          <MediaLibrary catalog={catalog} />
        ) : (
          <div className="py-20 text-center opacity-30 italic">No se encontraron resultados en el cat├ílogo.</div>
        )}
      </Suspense>
    </main>
  );
}
