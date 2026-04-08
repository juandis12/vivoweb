import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD, getPopular } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';
import { Film, Tv, Zap, Star, Play, PlayCircle, Award, Calendar, Clock } from 'lucide-react';

export const revalidate = 3600;

interface MediaItem {
  id: string;
  tmdb_id: string;
  title: string;
  source_url: string;
  poster_path: string | null;
  type: 'movie' | 'series' | 'anime';
}

interface TMDBResult {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const supabase = await createClient();

  const isMovie = category === 'peliculas';
  const isAnime = category === 'anime';
  const table = isMovie ? 'video_sources' : 'series_episodes';
  
  const { data: dbData } = await supabase.from(table).select('tmdb_id, stream_url');
  const availableIds = new Set(dbData?.map((i: any) => i.tmdb_id.toString()) || []);
  const sourceMap = new Map((dbData || []).map((i: any) => [i.tmdb_id.toString(), i.stream_url]));

  const tmdbType = isMovie ? 'movie' : 'tv';
  const tmdbData: TMDBResult[] = await getPopular(tmdbType);

  let filtered = tmdbData
    .filter((item: TMDBResult) => availableIds.has(item.id.toString()))
    .map((item: TMDBResult) => ({
      id: item.id.toString(),
      tmdb_id: item.id.toString(),
      title: item.title || item.name || 'Sin T├¡tulo',
      source_url: sourceMap.get(item.id.toString()) || '',
      poster_path: item.poster_path ? `${TMDB_IMAGE_CARD}${item.poster_path}` : null,
      type: (isAnime ? 'anime' : isMovie ? 'movie' : 'series') as any
    }));

  if (isAnime) {
    const detailedAnime = await Promise.all(filtered.slice(0, 15).map(async (item) => {
        const details = await fetchTMDB(`/tv/${item.tmdb_id}`);
        const isAnimeGenre = details?.genres?.some((g: any) => g.id === 16);
        const isJapanese = details?.origin_country?.includes('JP');
        return (isAnimeGenre || isJapanese) ? item : null;
    }));
    filtered = (detailedAnime.filter((i) => i !== null) as MediaItem[]);
  }

  const iconMap: Record<string, any> = {
    peliculas: <Film className="w-12 h-12" />,
    series: <Tv className="w-12 h-12" />,
    anime: <Zap className="w-12 h-12" />
  };

  const heroItem = filtered[0];

  return (
    <main className="min-h-screen pb-24">
      
      {/* 🎬 CATEGORY HERO SEM├üNTICO */}
      <section className="hero-banner" style={{ height: '70vh' }}>
        {heroItem?.poster_path && (
          <>
             <img 
               src={heroItem.poster_path.replace('w342', 'original')} 
               alt="Hero Backdrop" 
               className="absolute inset-0 w-full h-full object-cover -z-20 opacity-30"
             />
             <div className="hero-overlay" />
          </>
        )}

        <div className="hero-content">
           <div className="flex items-center gap-4 text-[var(--primary)] mb-4">
              <div className="p-3 bg-[var(--primary)]/10 rounded-2xl border border-[var(--primary)]/20 shadow-2xl">
                 {iconMap[category]}
              </div>
              <div>
                 <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Explorar Cat├ílogo</p>
                 <h1 className="hero-title" style={{ fontSize: '4rem' }}>{category}</h1>
              </div>
           </div>

           <div className="flex flex-wrap items-center gap-8 text-sm font-bold text-white/40 uppercase tracking-widest mb-8">
              <div className="flex items-center gap-2 text-[#46d369]">
                 <Star className="w-5 h-5 fill-current" />
                 <span>98% Match</span>
              </div>
              <div className="flex items-center gap-2">
                 <Calendar className="w-5 h-5" />
                 <span>2025</span>
              </div>
              <div className="px-2 py-0.5 border border-white/20 rounded text-[9px]">PREMIUM HD</div>
           </div>
        </div>
      </section>

      {/* 📋 GRID CON CLASES GLOBALES */}
      <div className="px-[var(--side-padding)] relative z-20 -mt-20">
         <h2 className="section-title">Novedades en {category}</h2>
         
         <Suspense fallback={<div className="grid grid-cols-6 gap-6">{Array(12).fill(0).map((_, i) => <div key={i} className="aspect-[2/3] bg-white/5 animate-pulse rounded-2xl" />)}</div>}>
           <MediaLibrary catalog={filtered} />
         </Suspense>

         {filtered.length === 0 && (
           <div className="text-center py-32 bg-white/5 rounded-[3rem] border border-white/5">
              <h3 className="text-3xl font-black text-white/10 uppercase tracking-tighter italic">No hay contenido disponible</h3>
              <p className="text-white/20 font-bold uppercase tracking-widest mt-2">Pr├│ximamente en VivoTV</p>
           </div>
         )}
      </div>
    </main>
  );
}
