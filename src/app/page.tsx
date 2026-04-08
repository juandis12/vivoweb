import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';

export const revalidate = 0; // Forzamos carga fresca

export default async function HomePage() {
  const supabase = await createClient();
  
  // SONDA: Obtener conteo y primera fila para inspeccionar nombres
  const { data: rawData, error: supabaseError, count } = await supabase
    .from('content')
    .select('*', { count: 'exact' });

  const rawCatalog = rawData || [];
  
  return (
    <main className="pt-32 px-6 pb-24 max-w-7xl mx-auto space-y-16">
      
      {/* PANEL DE DIAGN├ôSTICO TEMPORAL */}
      <div className="p-6 bg-primary/10 border border-primary/20 rounded-3xl">
        <h2 className="text-xl font-black uppercase text-primary mb-2">Estado del Cat├ílogo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-mono opacity-80">
          <p>┬┐Conectado?: {supabaseError ? 'ÔØî ERROR' : 'Ô£à S├ì'}</p>
          <p>Filas encontradas: {count ?? 0}</p>
          {rawData && rawData.length > 0 && (
            <p className="col-span-2 text-xs opacity-50 bg-black/20 p-2 rounded">
              Columnas detectadas: {Object.keys(rawData[0]).join(', ')}
            </p>
          )}
        </div>
      </div>

      {(rawCatalog.length > 0) ? (
        <section className="space-y-6">
           <h2 className="text-2xl font-black uppercase border-l-4 border-primary pl-4">Contenidos Disponibles</h2>
           <MediaLibrary catalog={await processCatalog(rawCatalog)} />
        </section>
      ) : (
        <div className="p-20 text-center bg-white/5 rounded-3xl border border-dashed border-white/10 opacity-30">
          No hay filas en la tabla "content".┬íAgrega una pel├¡cula en Supabase para verla aqu├¡!
        </div>
      )}
    </main>
  );
}

// Funci├│n helper de procesamiento
async function processCatalog(items: any[]) {
  return await Promise.all(
    items.map(async (item) => {
      let poster = null;
      try {
        const typeStr = item.content_type === 'movie' ? 'movie' : 'tv';
        const tmdbData = await fetchTMDB(`/${typeStr}/${item.tmdb_id}`);
        poster = tmdbData?.poster_path ? `${TMDB_IMAGE_CARD}${tmdbData.poster_path}` : null;
      } catch (e) {}

      return {
        id: item.id?.toString() || Math.random().toString(),
        tmdb_id: item.tmdb_id?.toString() || '0',
        title: item.title || 'Sin t├¡tulo',
        source_url: item.video_url || '',
        poster_path: poster,
        type: item.content_type === 'movie' ? 'movie' : 'series'
      };
    })
  );
}
