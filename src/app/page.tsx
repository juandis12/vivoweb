import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD, getPopular, getTopRated } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';
import { Play, Star, TrendingUp, Info } from 'lucide-react';

export const revalidate = 3600;

interface MediaItem {
  id: string;
  tmdb_id: string;
  title: string;
  source_url: string;
  poster_path: string | null;
  type: 'movie' | 'series' | 'anime';
  label?: string;
}

export default async function HomePage() {
  const supabase = await createClient();
  
  // 1. Obtenci├│n de disponibilida (Multitabla)
  const [moviesRes, seriesRes] = await Promise.all([
    supabase.from('video_sources').select('tmdb_id, stream_url'),
    supabase.from('series_episodes').select('tmdb_id, stream_url')
  ]);
  
  const availableIds = new Set([
      ...(moviesRes.data?.map(i => i.tmdb_id.toString()) || []),
      ...(seriesRes.data?.map(i => i.tmdb_id.toString()) || [])
  ]);

  const sourceMap = new Map([
      ...(moviesRes.data?.map(i => [i.tmdb_id.toString(), i.stream_url]) || []),
      ...(seriesRes.data?.map(i => [i.tmdb_id.toString(), i.stream_url]) || [])
  ]);

  // 2. Historial de visualizaci├│n
  const { data: rawHistory } = await supabase
    .from('watch_history')
    .select('*')
    .order('last_watched', { ascending: false })
    .limit(10);

  // 3. Obtener Secciones de TMDB Filtradas
  const [popMovies, popTV, topMovies, topTV] = await Promise.all([
    getPopular('movie'),
    getPopular('tv'),
    getTopRated('movie'),
    getTopRated('tv')
  ]);

  const mapToMediaItem = (item: any, type: 'movie' | 'series'): MediaItem => ({
    id: item.id.toString(),
    tmdb_id: item.id.toString(),
    title: item.title || item.name,
    source_url: sourceMap.get(item.id.toString()) || '',
    poster_path: item.poster_path ? `${TMDB_IMAGE_CARD}${item.poster_path}` : null,
    type: type as any
  });

  const filterAvailable = (items: any[], type: 'movie' | 'series') => 
    items.filter(item => availableIds.has(item.id.toString())).map(i => mapToMediaItem(i, type));

  const historyItems: MediaItem[] = await Promise.all((rawHistory || []).map(async (h: any) => {
    try {
      const typeStr = h.type === 'movie' ? 'movie' : 'tv';
      const tmdb = await fetchTMDB(`/${typeStr}/${h.tmdb_id}`);
      return {
        ...mapToMediaItem({ ...tmdb, id: h.tmdb_id }, h.type === 'movie' ? 'movie' : 'series'),
        label: `Visto ${Math.floor(h.progress_seconds / 60)} min`
      };
    } catch(e) { return null; }
  })).then(items => items.filter((i): i is MediaItem => i !== null));

  const popularMovies = filterAvailable(popMovies, 'movie');
  const popularSeries = filterAvailable(popTV, 'series');
  const topRatedMovies = filterAvailable(topMovies, 'movie');

  return (
    <main className="md:pl-20 min-h-screen pb-24 transition-all duration-500">
      
      {/* 🎬 HERO SECTION (Cinematic Apple TV Style) */}
      <section className="relative w-full h-[85vh] flex items-end px-6 md:px-16 pb-20">
        <div className="absolute inset-0 bg-gradient-to-t from-base via-base/40 to-transparent z-[1]" />
        <div className="absolute inset-0 bg-gradient-to-r from-base/80 via-transparent to-transparent z-[1]" />
        
        {popularMovies[0]?.poster_path && (
          <img 
            src={popularMovies[0].poster_path.replace('w342', 'original')} 
            alt="Hero Backdrop" 
            className="absolute inset-0 w-full h-full object-cover opacity-60 scale-105 blur-[2px] md:blur-none"
          />
        )}

        <div className="relative z-[10] max-w-4xl space-y-6 animate-fade">
           <div className="flex items-center gap-2 mb-2">
              <span className="bg-primary px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase shadow-lg shadow-primary/20">Exclusivo</span>
              <span className="text-white/40 text-[10px] font-black tracking-widest uppercase">Disponible ahora</span>
           </div>
           <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] text-white drop-shadow-2xl translate-x-[-4px]">
             {popularMovies[0]?.title}
           </h1>
           <p className="text-xl md:text-2xl text-white/60 max-w-2xl line-clamp-2 md:line-clamp-3 font-medium leading-relaxed">
             Vive la experiencia cinematogr├ífica definitiva con VivoTV. Calidad 4K HDR sin interrupciones directamente en tu pantalla.
           </p>
           
           <div className="flex flex-wrap gap-4 pt-4">
              <button className="px-8 py-4 bg-white text-base font-black rounded-2xl flex items-center gap-3 hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-xl">
                 <Play className="w-6 h-6 fill-base" /> Reproducir ahora
              </button>
              <button className="px-8 py-4 glass text-white font-black rounded-2xl flex items-center gap-3 hover:bg-white/10 transition-all hover:scale-105 active:scale-95">
                 <Info className="w-6 h-6" /> M├ís informaci├│n
              </button>
           </div>
        </div>
      </section>

      {/* 📋 SECCIONES DIN├üMICAS */}
      <div className="px-6 md:px-16 -mt-32 relative z-20 space-y-24">
        
        {historyItems.length > 0 && (
          <HomeRow title="Continuar Viendo" items={historyItems} icon={<Play className="w-8 h-8 text-primary" />} />
        )}

        <HomeRow title="Lo m├ís visto hoy" items={popularMovies.slice(1)} icon={<TrendingUp className="w-8 h-8 text-green-400" />} />
        
        <HomeRow title="Originales de VivoTV" items={popularSeries} icon={<Play className="w-8 h-8 text-primary" fill="currentColor" />} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
           <HomeRow title="Cine Premium" items={topRatedMovies.slice(0, 6)} icon={<Star className="w-8 h-8 text-yellow-500" />} />
           <HomeRow title="Series Imperdibles" items={popTV.filter(i => availableIds.has(i.id.toString())).slice(0, 6).map(i => mapToMediaItem(i, 'series'))} icon={<Star className="w-8 h-8 text-blue-500" />} />
        </div>
      </div>
    </main>
  );
}

function HomeRow({ title, items, icon }: { title: string; items: MediaItem[]; icon?: React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-8 animate-fade">
      <div className="flex items-center gap-4 border-l-8 border-primary pl-6">
        <div className="p-3 glass rounded-2xl shadow-xl">{icon}</div>
        <h2 className="text-3xl md:text-5xl font-black tracking-tighter uppercase leading-none">{title}</h2>
      </div>
      <Suspense fallback={<div className="h-64 bg-surface animate-pulse rounded-3xl" />}>
        <MediaLibrary catalog={items} />
      </Suspense>
    </section>
  );
}
