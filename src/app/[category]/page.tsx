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

  const typeMap: Record<string, string> = {
    'peliculas': 'movie',
    'series': 'series',
    'anime': 'anime'
  };

  const dbType = typeMap[category];
  const supabase = await createClient();
  
  // USANDO TABLA REAL: 'content'
  const { data: rawCatalog, error } = await supabase
    .from('content')
    .select('*')
    .eq('type', dbType)
    .limit(50);
  
  if (error) {
    return (
      <div className="pt-32 px-6">
        <h2 className="text-xl font-bold text-red-400">Error de conexión</h2>
        <p className="text-white/40">{error.message}</p>
      </div>
    );
  }

  const catalog: MediaItem[] = await Promise.all(
    (rawCatalog || []).map(async (item: any) => {
      let poster = null;
      let finalTitle = item.title || `Contenido ${item.tmdb_id}`;

      try {
        if (item.tmdb_id && item.tmdb_id !== "null") {
          const typeStr = (item.type === 'movie' || !item.type) ? 'movie' : 'tv';
          const tmdbData = await fetchTMDB(`/${typeStr}/${item.tmdb_id}`);
          if (tmdbData) {
            poster = tmdbData.poster_path ? `${TMDB_IMAGE_CARD}${tmdbData.poster_path}` : null;
            finalTitle = tmdbData.title || tmdbData.name || finalTitle;
          }
        }
      } catch (e) {}

      return {
        id: item.id || Math.random().toString(),
        tmdb_id: item.tmdb_id || '0',
        title: finalTitle,
        source_url: item.source_url || '',
        poster_path: poster,
        type: item.type === 'movie' ? 'movie' : (item.type === 'anime' ? 'anime' : 'series')
      } as MediaItem;
    })
  );

  const titles: Record<string, string> = {
    'peliculas': 'Lo mejor del Cine',
    'series': 'Series Imprescindibles',
    'anime': 'Mundo Anime'
  };

  return (
    <main className="pt-32 px-6 pb-24 max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-5xl font-black tracking-tighter mb-2 uppercase">
          {titles[category]}
        </h1>
        <p className="text-white/50 text-lg">
          Explora nuestra selección exclusiva de {category}.
        </p>
      </div>

      <Suspense fallback={<div className="h-64 flex items-center justify-center animate-pulse"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"/></div>}>
        {catalog.length > 0 ? (
          <MediaLibrary catalog={catalog} />
        ) : (
          <div className="py-20 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
             <p className="text-white/30">No se encontraron contenidos de tipo "{dbType}" en la tabla "content".</p>
          </div>
        )}
      </Suspense>
    </main>
  );
}
