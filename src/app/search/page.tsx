import { searchContent, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: query } = await searchParams;

  if (!query) {
    return (
      <main className="pt-32 px-6 flex flex-col items-center justify-center min-h-[60vh]">
        <h1 className="text-4xl font-black mb-4">¿Qué quieres ver hoy?</h1>
        <p className="text-white/50">Escribe algo en la barra de búsqueda superior.</p>
      </main>
    );
  }

  // Ejecutar b├║squeda en TMDB (SSR)
  const results = await searchContent(query);
  
  // Mapear resultados al formato de MediaLibrary
  const mappedResults = (results?.results || [])
    .filter((item: any) => item.media_type !== 'person') // Ignorar personas
    .map((item: any) => ({
      id: item.id.toString(),
      tmdb_id: item.id.toString(),
      title: item.title || item.name || 'Sin título',
      // En la b├║squeda de TMDB no tenemos la URL del embed de nuestra DB todav├¡a.
      // Pero podemos mostrar el poster y detalles.
      source_url: '', 
      poster_path: item.poster_path ? `${TMDB_IMAGE_CARD}${item.poster_path}` : null,
      type: item.media_type === 'movie' ? 'movie' : 'series'
    }));

  return (
    <main className="pt-32 px-6 pb-24 max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl font-black tracking-tight mb-2 uppercase">
          Resultados para: <span className="text-primary">{query}</span>
        </h1>
        <p className="text-white/50 text-sm">
          Se han encontrado {mappedResults.length} coincidencias en el catálogo global.
        </p>
      </div>

      <Suspense fallback={<div className="h-64 flex items-center justify-center animate-pulse"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"/></div>}>
        {mappedResults.length > 0 ? (
          <MediaLibrary catalog={mappedResults} />
        ) : (
          <div className="text-center py-20 bg-surface rounded-3xl border border-white/5">
            <p className="text-xl text-white/40 font-bold uppercase tracking-widest">No se encontraron resultados</p>
          </div>
        )}
      </Suspense>
    </main>
  );
}
