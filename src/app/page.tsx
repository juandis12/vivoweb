import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD, getPopular, getTopRated } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';
import { Play, Star, TrendingUp } from 'lucide-react';

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
  
  // 1. Obtener disponibilidad real de la tabla 'video_sources' (Motor de filtrado)
  const { data: availableData } = await supabase
    .from('video_sources')
    .select('tmdb_id, stream_url, type');
  
  const availableIds = new Set(availableData?.map(item => item.tmdb_id.toString()) || []);
  const sourceMap = new Map(availableData?.map(item => [item.tmdb_id.toString(), item.stream_url]) || []);

  // 2. Historial para "Continuar Viendo"
  const { data: rawHistory } = await supabase
    .from('watch_history')
    .select('*')
    .order('last_watched', { ascending: false })
    .limit(10);

  // 3. Obtener Secciones de TMDB y Filtrar por Disponibilidad
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

  // Procesar secciones
  const historyItems: MediaItem[] = await Promise.all((rawHistory || []).map(async (h: any) => {
    const typeStr = h.type === 'movie' ? 'movie' : 'tv';
    const tmdb = await fetchTMDB(`/${typeStr}/${h.tmdb_id}`);
    return {
      ...mapToMediaItem({ ...tmdb, id: h.tmdb_id }, h.type === 'movie' ? 'movie' : 'series'),
      label: `Visto ${Math.floor(h.progress_seconds / 60)} min`
    };
  }));

  const popularMovies = filterAvailable(popMovies, 'movie');
  const popularSeries = filterAvailable(popTV, 'series');
  const topRatedMovies = filterAvailable(topMovies, 'movie');
  const topRatedSeries = filterAvailable(topTV, 'series');

  return (
    <main className="pt-24 px-6 pb-24 max-w-7xl mx-auto space-y-16 overflow-x-hidden">
      
      {/* Hero Portada: Usamos la m├ís popular disponible */}
      <section className="w-full aspect-[4/3] md:aspect-[21/9] bg-surface-container rounded-3xl border border-white/5 flex items-end relative overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-t from-base via-base/60 to-transparent z-10" />
        <div className="z-20 p-8 md:p-14 w-full md:w-2/3">
          <div className="px-3 py-1 bg-primary/20 backdrop-blur-md rounded-full text-xs font-black tracking-widest uppercase border border-primary/30 inline-block mb-4 text-primary">
            Sugerencia para ti
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-4 text-white drop-shadow-lg leading-none">
            {popularMovies[0]?.title || 'BIENVENIDO A VIVOTV'}
          </h1>
          <p className="text-white/60 text-lg md:text-xl line-clamp-2 select-none mb-6">
            Lo mejor del cine y la televisi├│n en un solo lugar. Todo el cat├ílogo de TMDB filtrado para ti.
          </p>
        </div>
        {popularMovies[0]?.poster_path && (
           <img src={popularMovies[0].poster_path} alt="Hero" className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-screen scale-110 blur-sm md:blur-none" />
        )}
      </section>

      {/* FILA: Continuar Viendo */}
      {historyItems.length > 0 && (
         <HomeRow title="Continuar Viendo" items={historyItems} icon={<Play className="w-6 h-6 text-primary" />} />
      )}

      {/* FILA: Pel├¡culas Populares */}
      <HomeRow title="Pel├¡culas Tendencia" items={popularMovies} icon={<TrendingUp className="w-6 h-6 text-green-400" />} />

      {/* FILA: Series Tendencia */}
      <HomeRow title="Series M├ís Vistas" items={popularSeries} icon={<TrendingUp className="w-6 h-6 text-blue-400" />} />

      {/* FILA: Mejor Valoradas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <HomeRow title="Cine de Culto" items={topRatedMovies.slice(0, 6)} icon={<Star className="w-6 h-6 text-yellow-400" />} />
        <HomeRow title="Series Top Rated" items={topRatedSeries.slice(0, 6)} icon={<Star className="w-6 h-6 text-yellow-500" />} />
      </div>

    </main>
  );
}

function HomeRow({ title, items, icon }: { title: string; items: MediaItem[]; icon?: React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3 border-l-4 border-primary pl-4">
        {icon}
        <h2 className="text-2xl font-black tracking-tighter uppercase">{title}</h2>
      </div>
      <Suspense fallback={<div className="h-40 bg-surface animate-pulse rounded-xl" />}>
        <MediaLibrary catalog={items} />
      </Suspense>
    </section>
  );
}
