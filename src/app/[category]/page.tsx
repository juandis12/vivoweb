import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';

export const revalidate = 3600;

const VALID_CATEGORIES = ['peliculas', 'series', 'anime'];

interface MediaItem {
  id: string;
  tmdb_id: string;
  title: string;
  source_url: string;
  poster_path: string | null;
  type: 'movie' | 'series' | 'anime';
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;

  if (!VALID_CATEGORIES.includes(category)) {
    return notFound();
  }

  // Mapeo real al esquema: Anime tambi├⌐n usa 'series'
  const typeMap: Record<string, string> = {
    'peliculas': 'movie',
    'series': 'series',
    'anime': 'series' 
  };

  const dbType = typeMap[category];
  const supabase = await createClient();
  
  const { data: rawCatalog, error } = await supabase
    .from('content')
    .select('*')
    .eq('content_type', dbType)
    .limit(100);
  
  const catalog: MediaItem[] = await Promise.all(
    (rawCatalog || []).map(async (item: any) => {
      let poster = null;
      let finalTitle = item.title || `ID: ${item.tmdb_id}`;

      try {
        if (item.tmdb_id) {
          const typeStr = item.content_type === 'movie' ? 'movie' : 'tv';
          const tmdbData = await fetchTMDB(`/${typeStr}/${item.tmdb_id}`);
          if (tmdbData) {
            poster = tmdbData.poster_path ? `${TMDB_IMAGE_CARD}${tmdbData.poster_path}` : null;
            finalTitle = tmdbData.title || tmdbData.name || finalTitle;
          }
        }
      } catch (e) {}

      return {
        id: item.id || '',
        tmdb_id: item.tmdb_id?.toString() || '0',
        title: finalTitle,
        source_url: item.video_url || '',
        poster_path: poster,
        type: item.content_type === 'movie' ? 'movie' : 'series'
      } as MediaItem;
    })
  );

  const titles: Record<string, string> = {
    'peliculas': 'Cine Premium',
    'series': 'Series VivoTV',
    'anime': 'Universo Anime'
  };

  return (
    <main className="pt-32 px-6 pb-24 max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-5xl font-black tracking-tighter mb-2 uppercase">{titles[category]}</h1>
      </div>
      <Suspense fallback={<div className="h-64 flex items-center justify-center animate-pulse"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"/></div>}>
        <MediaLibrary catalog={catalog} />
      </Suspense>
    </main>
  );
}
