import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';

export const revalidate = 0; 

export default async function HomePage() {
  const supabase = await createClient();
  
  // CONSULTA A LA TABLA CORRECTA: video_sources
  const { data: rawData, error: supabaseError, count } = await supabase
    .from('video_sources')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(100);

  const rawCatalog = rawData || [];
  
  return (
    <main className="pt-32 px-6 pb-24 max-w-7xl mx-auto space-y-16">
      
      {/* PANEL DE ESTADO ACTUALIZADO */}
      <div className="p-6 bg-green-500/10 border border-green-500/20 rounded-3xl">
        <h2 className="text-xl font-black uppercase text-green-400 mb-2">┬íCat├ílogo Encontrado!</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-mono opacity-80">
          <p>Tabla activa: video_sources</p>
          <p>Registros cargados: {rawCatalog.length} de {count ?? 0}</p>
        </div>
      </div>

      {(rawCatalog.length > 0) ? (
        <section className="space-y-6">
           <div className="flex items-center justify-between border-l-4 border-primary pl-4">
              <h2 className="text-2xl font-black uppercase">Agregados Recientemente</h2>
           </div>
           <Suspense fallback={<div className="h-64 flex items-center justify-center animate-pulse"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"/></div>}>
              <MediaLibrary catalog={await processCatalog(rawCatalog)} />
           </Suspense>
        </section>
      ) : (
        <div className="p-20 text-center bg-white/5 rounded-3xl border border-dashed border-white/10 opacity-30">
          No se pudieron cargar datos de "video_sources".
        </div>
      )}
    </main>
  );
}

// Procesamiento inteligente: Obtenemos metadatos en tiempo real desde TMDB
async function processCatalog(items: any[]) {
  return await Promise.all(
    items.map(async (item) => {
      let poster = null;
      let title = `Cargando...`;

      try {
        if (item.tmdb_id) {
          const typeStr = item.type === 'movie' ? 'movie' : 'tv';
          const tmdbData = await fetchTMDB(`/${typeStr}/${item.tmdb_id}`);
          if (tmdbData) {
            poster = tmdbData.poster_path ? `${TMDB_IMAGE_CARD}${tmdbData.poster_path}` : null;
            title = tmdbData.title || tmdbData.name || `ID: ${item.tmdb_id}`;
          }
        }
      } catch (e) {
        console.error("Error procesando item:", item.tmdb_id, e);
      }

      return {
        id: item.id?.toString() || Math.random().toString(),
        tmdb_id: item.tmdb_id?.toString() || '0',
        title: title,
        source_url: item.stream_url || '', // Tu columna se llama stream_url
        poster_path: poster,
        type: item.type === 'movie' ? 'movie' : 'series'
      };
    })
  );
}
