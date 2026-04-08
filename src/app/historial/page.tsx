import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';
import { Clock, History } from 'lucide-react';

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
  
  const { data: rawHistory } = await supabase
    .from('watch_history')
    .select('*')
    .order('last_watched', { ascending: false })
    .limit(40);

  let catalog: MediaItem[] = [];

  if (rawHistory && rawHistory.length > 0) {
    catalog = await Promise.all(
      rawHistory.map(async (item: any) => {
        const typeStr = item.type === 'movie' ? 'movie' : 'tv';
        const tmdbData = await fetchTMDB(`/${typeStr}/${item.tmdb_id}`);
        const minutes = Math.floor((item.progress_seconds || 0) / 60);
        
        return {
          id: item.id.toString(),
          tmdb_id: item.tmdb_id.toString(),
          title: tmdbData?.title || tmdbData?.name || 'Contenido Reciente',
          source_url: '', 
          poster_path: tmdbData?.poster_path ? `${TMDB_IMAGE_CARD}${tmdbData.poster_path}` : null,
          type: (item.type === 'movie' ? 'movie' : 'series') as any,
          label: `Continuar: ${minutes} min`
        } as MediaItem;
      })
    );
  }

  return (
    <main className="page-container">
      <div className="section-header">
        <div className="p-4 bg-[var(--primary)]/10 rounded-2xl border border-[var(--primary)]/20 shadow-2xl">
           <History className="w-10 h-10 text-[var(--primary)]" />
        </div>
        <div>
           <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Actividad Reciente</p>
           <h1 className="font-[Epilogue] italic">Tu Historial</h1>
        </div>
      </div>

      <Suspense fallback={<div className="grid grid-cols-6 gap-6">{Array(6).fill(0).map((_, i) => <div key={i} className="aspect-[2/3] bg-white/5 animate-pulse rounded-2xl" />)}</div>}>
        {catalog.length > 0 ? (
          <MediaLibrary catalog={catalog} />
        ) : (
          <div className="text-center py-40 bg-white/5 rounded-[3rem] border border-white/5">
             <Clock className="w-16 h-16 text-white/5 mx-auto mb-6" />
             <h3 className="text-2xl font-black text-white/10 uppercase tracking-tighter italic">Tu historial est├í vac├¡o</h3>
          </div>
        )}
      </Suspense>
    </main>
  );
}
