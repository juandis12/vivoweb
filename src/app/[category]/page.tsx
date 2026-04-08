import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';

export const revalidate = 3600;

const VALID_CATEGORIES = ['peliculas', 'series', 'anime'];

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;

  if (!VALID_CATEGORIES.includes(category)) {
    return notFound();
  }

  // Mapeo del slug al tipo en la base de datos
  const typeMap: Record<string, string> = {
    'peliculas': 'movie',
    'series': 'series',
    'anime': 'anime'
  };

  const dbType = typeMap[category];
  const supabase = await createClient();
  
  // Obtener el cat├ílogo filtrado por tipo
  const { data: rawCatalog, error } = await supabase.rpc('get_catalog_ids');
  
  if (error) {
    return <div className="pt-32 px-6">Error al cargar datos.</div>;
  }

  // Filtrar en el servidor por el tipo correspondiente
  const filteredCatalog = (rawCatalog || [])
    .filter((item: any) => item.type === dbType)
    .slice(0, 50);

  // Enriquecer con TMDB
  const catalog = await Promise.all(
    filteredCatalog.map(async (item: any) => {
      let poster = null;
      let finalTitle = item.title || `Contenido ${item.tmdb_id}`;

      if (item.tmdb_id && item.tmdb_id !== "null") {
        const typeStr = item.type === 'movie' ? 'movie' : 'tv';
        const tmdbData = await fetchTMDB(`/${typeStr}/${item.tmdb_id}`);
        if (tmdbData) {
          poster = tmdbData.poster_path ? `${TMDB_IMAGE_CARD}${tmdbData.poster_path}` : null;
          finalTitle = tmdbData.title || tmdbData.name || finalTitle;
        }
      }

      return {
        id: item.id || Math.random().toString(),
        tmdb_id: item.tmdb_id || '0',
        title: finalTitle,
        source_url: item.source_url || item.embed_url || '',
        poster_path: poster,
        type: item.type || 'movie'
      };
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
        <MediaLibrary catalog={catalog} />
      </Suspense>
    </main>
  );
}
