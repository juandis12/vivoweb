import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';

export const revalidate = 3600;

interface CatalogItem {
  id?: string;
  tmdb_id: string;
  title?: string;
  source_url?: string;
  embed_url?: string;
  type?: 'movie' | 'series' | 'anime';
}

interface MediaItem {
  id: string;
  tmdb_id: string;
  title: string;
  source_url: string;
  poster_path: string | null;
  type: 'movie' | 'series' | 'anime';
}

export default async function HomePage() {
  const supabase = await createClient();
  
  // 1. Obtener la malla completa para distribuir
  const { data: rawData, error } = await supabase.rpc('get_catalog_ids');
  const rawCatalog = rawData as CatalogItem[] | null;
  
  if (error) console.error('Error fetching catalog:', error);

  const processCatalog = async (items: CatalogItem[]) => {
    return await Promise.all(
      items.map(async (item) => {
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
        } as MediaItem;
      })
    );
  };

  const recentItems = rawCatalog ? await processCatalog(rawCatalog.slice(0, 12)) : [];
  const movies = rawCatalog ? await processCatalog(rawCatalog.filter(i => i.type === 'movie').slice(0, 6)) : [];
  const series = rawCatalog ? await processCatalog(rawCatalog.filter(i => i.type === 'series').slice(0, 6)) : [];

  return (
    <main className="pt-24 px-6 pb-24 max-w-7xl mx-auto space-y-16">
      
      {/* Hero Portada Principal */}
      <section className="w-full aspect-[4/3] md:aspect-[21/9] bg-surface-container rounded-3xl border border-white/5 flex items-end relative overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-t from-base via-base/80 to-transparent z-10" />
        <div className="z-20 p-8 md:p-14 w-full md:w-2/3">
          <div className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-black tracking-widest uppercase border border-white/10 inline-block mb-4 text-primary w-max">
            VivoWeb Premium
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-4 text-white drop-shadow-lg leading-none">
            {recentItems[0]?.title || 'CATÁLOGO VIVO'}
          </h1>
          <p className="text-white/60 text-lg md:text-xl line-clamp-2 md:line-clamp-3 select-none mb-6">
            Disfruta de la mejor experiencia de streaming con la base de datos más completa y actualizada.
          </p>
          <div className="flex gap-4">
             <button className="px-8 py-3 bg-white text-black font-bold rounded-lg hover:bg-primary hover:text-white transition-all transform hover:scale-105">Reproducir</button>
             <button className="px-8 py-3 bg-white/10 text-white font-bold rounded-lg hover:bg-white/20 transition-all backdrop-blur-md">Más información</button>
          </div>
        </div>
        
        {recentItems[0]?.poster_path && (
           <img 
              src={recentItems[0].poster_path} 
              alt="Hero bg" 
              className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-screen scale-105" 
           />
        )}
      </section>

      {/* Secciones del Home */}
      <HomeSection title="Agregados Recientemente" items={recentItems} />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <HomeSection title="Cine Premium" items={movies} />
        <HomeSection title="Series Tendencia" items={series} />
      </div>

      {!rawCatalog && (
        <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/10 text-red-200">
          Error: No se pudo conectar con la base de datos de Supabase.
        </div>
      )}
    </main>
  );
}

function HomeSection({ title, items }: { title: string; items: MediaItem[] }) {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between border-l-4 border-primary pl-4">
        <h2 className="text-2xl font-black tracking-tighter uppercase">{title}</h2>
        <span className="text-primary text-xs font-bold hover:underline cursor-pointer">Ver todo</span>
      </div>
      <Suspense fallback={<div className="h-40 bg-surface animate-pulse rounded-xl" />}>
        <MediaLibrary catalog={items} />
      </Suspense>
    </section>
  );
}
