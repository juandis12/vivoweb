import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';
import { Heart } from 'lucide-react';

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
  
  // USANDO ESQUEMA REAL: user_favorites
  const { data: favs, error } = await supabase
    .from('user_favorites')
    .select('*')
    .order('created_at', { ascending: false });

  let catalog: MediaItem[] = [];

  if (favs && favs.length > 0) {
    catalog = await Promise.all(
      favs.map(async (item: any) => {
        const typeStr = item.type === 'movie' ? 'movie' : 'tv';
        const tmdbData = await fetchTMDB(`/${typeStr}/${item.tmdb_id}`);
        
        return {
          id: item.id.toString(),
          tmdb_id: item.tmdb_id.toString(),
          title: tmdbData?.title || tmdbData?.name || `Favorito ${item.tmdb_id}`,
          source_url: '', 
          poster_path: tmdbData?.poster_path ? `${TMDB_IMAGE_CARD}${tmdbData.poster_path}` : null,
          type: (item.type === 'movie' ? 'movie' : 'series') as any
        } as MediaItem;
      })
    );
  }

  return (
    <main className="pt-32 px-6 pb-24 max-w-7xl mx-auto">
      <h1 className="text-5xl font-black tracking-tighter mb-12 uppercase flex items-center gap-3">
        <Heart className="w-10 h-10 text-primary fill-primary" /> Mi Lista
      </h1>

      <Suspense fallback={<div className="h-64 flex items-center justify-center animate-pulse"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"/></div>}>
        {catalog.length > 0 ? (
          <MediaLibrary catalog={catalog} />
        ) : (
          <div className="py-20 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
             <p className="text-white/30">Tu lista está vacía. ¡Añade algo que te guste!</p>
          </div>
        )}
      </Suspense>
    </main>
  );
}
