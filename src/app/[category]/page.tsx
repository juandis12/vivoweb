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
  if (!VALID_CATEGORIES.includes(category)) return notFound();

  const supabase = await createClient();
  
  let rawItems: any[] = [];

  // FILTRADO MULTITABLA
  if (category === 'peliculas') {
    const { data } = await supabase.from('video_sources').select('*').limit(100);
    rawItems = data || [];
  } else {
    // Para Series y Anime buscamos en 'series_episodes'
    // Usamos una consulta que agrupa por tmdb_id para no repetir el show
    const { data } = await supabase
      .from('series_episodes')
      .select('*')
      .limit(500); // Tomamos un lote grande para filtrar inteligentemente

    // Agrupamos manualmente para quedarnos con un registro por serie
    const seen = new Set();
    rawItems = (data || []).filter(item => {
      if (seen.has(item.tmdb_id)) return false;
      seen.add(item.tmdb_id);
      return true;
    }).slice(0, 50);
  }

  const catalog: MediaItem[] = (await Promise.all(
    rawItems.map(async (item: any) => {
      try {
        const typeStr = category === 'peliculas' ? 'movie' : 'tv';
        const tmdbData = await fetchTMDB(`/${typeStr}/${item.tmdb_id}`);
        if (!tmdbData) return null;

        const isAnimation = tmdbData.genres?.some((g: any) => g.id === 16);
        const isJapan = tmdbData.origin_country?.includes('JP');
        const isAnime = isAnimation && isJapan;

        // FILTRO ESTRICTO:
        if (category === 'anime' && !isAnime) return null;
        if (category === 'series' && isAnime) return null;

        return {
          id: item.id.toString(),
          tmdb_id: item.tmdb_id.toString(),
          title: tmdbData.title || tmdbData.name || `ID: ${item.tmdb_id}`,
          source_url: item.stream_url || '',
          poster_path: tmdbData.poster_path ? `${TMDB_IMAGE_CARD}${tmdbData.poster_path}` : null,
          type: category as any
        } as MediaItem;
      } catch (e) {
        return null;
      }
    })
  )).filter((i): i is MediaItem => i !== null);

  const titles: Record<string, string> = {
    'peliculas': 'Lo mejor del Cine',
    'series': 'Series de Estreno',
    'anime': 'Mundo Anime'
  };

  return (
    <main className="pt-32 px-6 pb-24 max-w-7xl mx-auto">
      <h1 className="text-5xl font-black tracking-tighter mb-12 uppercase border-l-4 border-primary pl-6">
        {titles[category]}
      </h1>

      <Suspense fallback={<div className="h-64 flex items-center justify-center animate-pulse"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"/></div>}>
        {catalog.length > 0 ? (
          <MediaLibrary catalog={catalog} />
        ) : (
          <div className="py-20 text-center opacity-30 italic">No hay contenido disponible en esta categor├¡a.</div>
        )}
      </Suspense>
    </main>
  );
}
