import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';
import { Clock } from 'lucide-react';

interface MediaItem {
  id: string;
  tmdb_id: string;
  title: string;
  source_url: string;
  poster_path: string | null;
  type: 'movie' | 'series' | 'anime';
  label?: string;
}

export default async function HistorialPage() {
  const supabase = await createClient();
  
  // USANDO NOMBRE REAL DE TABLA: watch_history
  const { data: rawHistory, error } = await supabase
    .from('watch_history')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(40);

  let catalog: MediaItem[] = [];

  if (rawHistory && rawHistory.length > 0) {
    catalog = await Promise.all(
      rawHistory.map(async (item: any) => {
        const typeStr = (item.type === 'movie' || !item.type) ? 'movie' : 'tv';
        const tmdbData = await fetchTMDB(`/${typeStr}/${item.tmdb_id}`);
        
        const minutes = Math.floor(item.last_position / 60);
        const seconds = item.last_position % 60;

        return {
          id: item.id.toString(),
          tmdb_id: item.tmdb_id.toString(),
          title: tmdbData?.title || tmdbData?.name || `ID: ${item.tmdb_id}`,
          source_url: '', 
          poster_path: tmdbData?.poster_path ? `${TMDB_IMAGE_CARD}${tmdbData.poster_path}` : null,
          type: item.type || 'movie',
          label: `Visto hasta: ${minutes}:${seconds.toString().padStart(2, '0')}`
        } as MediaItem;
      })
    );
  }

  return (
    <main className="pt-32 px-6 pb-24 max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-5xl font-black tracking-tighter mb-2 uppercase">Historial</h1>
        <p className="text-white/50 text-lg flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Continúa viendo donde lo dejaste.
        </p>
      </div>

      <Suspense fallback={<div className="h-64 flex items-center justify-center animate-pulse"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"/></div>}>
        {catalog.length > 0 ? (
          <MediaLibrary catalog={catalog} />
        ) : (
          <div className="text-center py-20 bg-surface rounded-3xl border border-white/5 flex flex-col items-center gap-4">
            <p className="text-xl text-white/40 font-bold uppercase tracking-widest">No hay historial</p>
            <p className="text-white/20 max-w-xs text-sm">Tus reproducciones aparecerán aquí en tiempo real.</p>
          </div>
        )}
      </Suspense>
    </main>
  );
}
