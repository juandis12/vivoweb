import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';

// Interfaces de Tipo para evitar errores de compilación
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

export const revalidate = 3600;

export default async function HomePage() {
  const supabase = await createClient();
  
  // 1. Obtener la malla de URLs y TMDB_IDs desde Supabase
  const { data: rawData, error: supabaseError } = await supabase.rpc('get_catalog_ids');
  const rawCatalog = rawData as CatalogItem[] | null;
  
  if (supabaseError) console.error('Error fetching catalog:', supabaseError);
  
  let catalog: MediaItem[] = [];

  // 2. Transmutación en el Servidor (Fusión Supabase + TMDB)
  if (rawCatalog && Array.isArray(rawCatalog) && rawCatalog.length > 0) {
    const expandedData = await Promise.all(
      rawCatalog.slice(0, 30).map(async (item) => {
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
    catalog = expandedData;
  }

  return (
    <main className="pt-24 px-6 pb-24 max-w-7xl mx-auto">
      {/* Hero Portada Principal */}
      <section className="w-full aspect-[4/3] md:aspect-[21/9] bg-surface-container rounded-3xl border border-white/5 flex items-end relative overflow-hidden mb-12 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-t from-base via-base/80 to-transparent z-10" />
        <div className="z-20 p-8 md:p-14 w-full md:w-2/3">
          <div className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-black tracking-widest uppercase border border-white/10 inline-block mb-4 text-primary w-max">
            Estreno Next.js
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-4 text-white drop-shadow-lg">
            {catalog.length > 0 ? catalog[0].title : 'CATÁLOGO VIVO'}
          </h1>
          <p className="text-white/60 text-lg md:text-xl line-clamp-2 md:line-clamp-3 select-none">
            El sistema ha sido purgado. Tu backend Supabase y tu arquitectura Server-Side Rendering (SSR) están 100% operativos. Haz clic en cualquier portada de abajo para encender el reproductor protegido.
          </p>
        </div>
        
        {/* Póster de Fondo Difuminado */}
        {catalog.length > 0 && catalog[0].poster_path && (
           <img 
              src={catalog[0].poster_path} 
              alt="Hero bg" 
              className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-screen scale-105" 
           />
        )}
      </section>

      <div className="mb-8">
        <h2 className="text-2xl font-black tracking-tight mb-2">Agregados Recientemente</h2>
        <p className="text-white/50 text-sm">Películas y series extraídas directamente desde tu DB.</p>
      </div>

      {(supabaseError || !rawCatalog) && (
        <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/10 text-red-200 mb-8">
          {supabaseError ? `Error Supabase: ${supabaseError.message}` : 'No se encontraron datos en el catálogo.'} 
          <br />
          <span className="text-xs opacity-50">Verifica tus variables de entorno y que la función RPC get_catalog_ids exista.</span>
        </div>
      )}

      {/* Catálogo Interactivo */}
      <Suspense fallback={<div className="h-64 flex items-center justify-center animate-pulse"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"/></div>}>
        <MediaLibrary catalog={catalog} />
      </Suspense>
    </main>
  );
}
