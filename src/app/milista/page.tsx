import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';
import { Info } from 'lucide-react';

interface MediaItem {
  id: string;
  tmdb_id: string;
  title: string;
  source_url: string;
  poster_path: string | null;
  type: 'movie' | 'series' | 'anime';
}

export default async function MiListaPage() {
  const supabase = await createClient();
  
  // USANDO NOMBRE REAL DE TABLA: user_favorites
  const { data: rawFavorites, error } = await supabase
    .from('user_favorites')
    .select('*')
    .order('created_at', { ascending: false });

  let catalog: MediaItem[] = [];

  if (rawFavorites && rawFavorites.length > 0) {
    catalog = await Promise.all(
      rawFavorites.map(async (item: any) => {
        const typeStr = (item.type === 'movie' || !item.type) ? 'movie' : 'tv';
        const tmdbData = await fetchTMDB(`/${typeStr}/${item.tmdb_id}`);
        
        return {
          id: item.id.toString(),
          tmdb_id: item.tmdb_id.toString(),
          title: tmdbData?.title || tmdbData?.name || 'Cargando...',
          source_url: item.source_url || '',
          poster_path: tmdbData?.poster_path ? `${TMDB_IMAGE_CARD}${tmdbData.poster_path}` : null,
          type: item.type || 'movie'
        } as MediaItem;
      })
    );
  }

  return (
    <main className="pt-32 px-6 pb-24 max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-5xl font-black tracking-tighter mb-2 uppercase">Mi Lista</h1>
        <p className="text-white/50 text-lg flex items-center gap-2">
          <Info className="w-5 h-5 text-primary" />
          Tus películas y series guardadas para ver más tarde.
        </p>
      </div>

      <Suspense fallback={<div className="h-64 flex items-center justify-center animate-pulse"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"/></div>}>
        {catalog.length > 0 ? (
          <MediaLibrary catalog={catalog} />
        ) : (
          <div className="text-center py-20 bg-surface rounded-3xl border border-white/5 flex flex-col items-center gap-4">
            <p className="text-xl text-white/40 font-bold uppercase tracking-widest">Tu lista está vacía</p>
            <p className="text-white/20 max-w-xs text-sm">Agrega contenidos desde el inicio para verlos aquí.</p>
          </div>
        )}
      </Suspense>
    </main>
  );
}
