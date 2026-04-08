import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';

export const revalidate = 3600;

export default async function HomePage() {
  const supabase = await createClient();
  
  // 1. Intentar obtener el catálogo (Peliculas es el nombre más probable)
  const { data: rawData, error: supabaseError } = await supabase
    .from('peliculas')
    .select('*')
    .limit(10);

  // DEBUG: Si falla, intentar ver si la tabla se llama 'catalog'
  let finalData = rawData;
  let finalError = supabaseError;

  if (supabaseError) {
    const { data: altData, error: altError } = await supabase.from('catalog').select('*').limit(10);
    if (!altError) {
      finalData = altData;
      finalError = null;
    }
  }

  return (
    <main className="pt-24 px-6 pb-24 max-w-7xl mx-auto space-y-16">
      <section className="p-8 rounded-3xl bg-red-500/10 border border-red-500/20">
        <h2 className="text-2xl font-bold text-red-400 mb-4">Error de Conexión Detectado</h2>
        <p className="text-white/60 mb-2">Mensaje técnico de Supabase:</p>
        <code className="block p-4 bg-black/40 rounded-lg text-xs text-red-300 whitespace-pre-wrap">
          {finalError ? JSON.stringify(finalError, null, 2) : 'No se recibió error, pero la tabla está vacía.'}
        </code>
        <div className="mt-6 flex gap-4">
           <button onClick={() => window.location.reload()} className="px-4 py-2 bg-white text-black text-sm font-bold rounded">Reintentar</button>
           <p className="text-xs text-white/20 italic">Asegúrate de que la tabla "peliculas" o "catalog" exista en Supabase.</p>
        </div>
      </section>
    </main>
  );
}
