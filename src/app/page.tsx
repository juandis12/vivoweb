import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD, getPopular, getTopRated } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import MeshBackground from '@/components/MeshBackground';
import { Suspense } from 'react';
import { Play, Info, Award, Clock, Star, TrendingUp } from 'lucide-react';

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
  
  // Fetch available content from our database
  const [moviesRes, seriesRes] = await Promise.all([
    supabase.from('video_sources').select('tmdb_id, stream_url'),
    supabase.from('series_episodes').select('tmdb_id, stream_url')
  ]);
  
  const availableData = [...(moviesRes.data || []), ...(seriesRes.data || [])];
  const availableIds = new Set<string>(availableData?.map((item: any) => item.tmdb_id.toString()) || []);
  const sourceMap = new Map<string, string>((availableData || []).map((item: any) => [item.tmdb_id.toString(), item.stream_url]));

  const { data: rawHistory } = await supabase
    .from('watch_history')
    .select('*')
    .order('last_watched', { ascending: false })
    .limit(10);

  const [popMovies, popTV, topMovies] = await Promise.all([
    getPopular('movie'),
    getPopular('tv'),
    getTopRated('movie')
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
    items.filter((item: any) => availableIds.has(item.id.toString())).map(i => mapToMediaItem(i, type));

  const historyItemsList = await Promise.all((rawHistory || []).map(async (h: any) => {
    try {
      const typeStr = h.type === 'movie' ? 'movie' : 'tv';
      const tmdb = await fetchTMDB(`/${typeStr}/${h.tmdb_id}`);
      if (!tmdb) return null;
      return {
        ...mapToMediaItem({ ...tmdb, id: h.tmdb_id }, h.type === 'movie' ? 'movie' : 'series'),
        label: `Visto ${Math.floor(h.progress_seconds / 60)} min`
      };
    } catch(e) { return null; }
  }));

  const historyItems = (historyItemsList.filter((i) => i !== null) as any) as MediaItem[];
  const popularMovies = filterAvailable(popMovies, 'movie');
  const popularSeries = filterAvailable(popTV, 'series');
  const topRatedMovies = filterAvailable(topMovies, 'movie');
  
  const heroItem = popularMovies[0];

  return (
    <main className="dashboard-container">
      <MeshBackground />
      
      {/* 🎬 MAIN HERO BANNER */}
      <section className="hero-banner">
        {heroItem?.poster_path && (
          <>
             <img 
               src={heroItem.poster_path.replace('w342', 'original')} 
               alt="Hero Backdrop" 
               className="absolute inset-0 w-full h-full object-cover -z-20 opacity-40 transition-transform duration-[10s] hover:scale-110"
             />
             <div className="hero-overlay" />
          </>
        )}

        <div className="hero-content">
           <div className="flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full w-fit border border-white/10 mb-4 scale-in">
              <TrendingUp className="w-4 h-4 text-[var(--primary)]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/70">#1 Tendencia Global</span>
           </div>

           <h1 className="hero-title">{heroItem?.title || 'VivoTV Premium'}</h1>

           <div className="flex flex-wrap items-center gap-8 text-sm font-bold text-white/40 uppercase tracking-widest mb-6">
              <div className="flex items-center gap-2 text-[#46d369]">
                 <Star className="w-5 h-5 fill-current" />
                 <span>98% Match</span>
              </div>
              <span className="meta-divider h-1 w-1 bg-white/20 rounded-full" />
              <span>2024</span>
              <span className="px-2 py-0.5 border border-white/20 rounded text-[9px]">4K ULTRA HD</span>
           </div>

           <p className="text-xl text-white/60 max-w-2xl leading-relaxed mb-8 font-bold">
             Experimenta la mayor velocidad de carga y la mejor calidad de imagen en la plataforma líder de streaming premium.
           </p>
           
           <div className="flex items-center gap-5">
              <button className="btn btn-primary text-xl">
                 <Play className="w-6 h-6 fill-current" /> VER AHORA
              </button>
              <button className="btn btn-secondary">
                 <Info className="w-6 h-6" /> MÁS INFO
              </button>
           </div>
        </div>
      </section>

      {/* DYNAMIC CATEGORIES */}
      <div className="catalogs-wrapper px-[var(--side-padding)] -mt-32 relative z-20 space-y-24 pb-24">
        {historyItems.length > 0 && (
          <section>
            <div className="row-header mb-8">
               <h3 className="section-title"><Clock className="inline mr-3 w-8 h-8 text-[var(--primary)]" /> Continuar Viendo</h3>
            </div>
            <MediaLibrary catalog={historyItems} />
          </section>
        )}

        <section>
          <div className="row-header mb-8">
             <h3 className="section-title"><Award className="inline mr-3 w-8 h-8 text-yellow-500" /> Tendencias de Hoy</h3>
          </div>
          <Suspense fallback={<div className="h-64 bg-white/5 animate-pulse rounded-3xl" />}>
            <MediaLibrary catalog={popularMovies.slice(1)} />
          </Suspense>
        </section>

        <section>
          <div className="row-header mb-8">
             <h3 className="section-title"><Play className="inline mr-3 w-8 h-8 text-[var(--primary)]" /> Series Originales</h3>
          </div>
          <Suspense fallback={<div className="h-64 bg-white/5 animate-pulse rounded-3xl" />}>
            <MediaLibrary catalog={(popularSeries as any) as MediaItem[]} />
          </Suspense>
        </section>

        <section>
          <div className="row-header mb-8">
             <h3 className="section-title"><Star className="inline mr-3 w-8 h-8 text-yellow-500" /> Los Favoritos de la Crítica</h3>
          </div>
          <Suspense fallback={<div className="h-64 bg-white/5 animate-pulse rounded-3xl" />}>
            <MediaLibrary catalog={topRatedMovies} />
          </Suspense>
        </section>
      </div>

    </main>
  );
}
