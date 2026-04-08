import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD, getPopular, getTopRated } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import MeshBackground from '@/components/MeshBackground';
import { Suspense } from 'react';
import { Play, Info, Star, Tv } from 'lucide-react';

export const revalidate = 3600;

export default async function SeriesPage() {
  const supabase = await createClient();
  
  // Available TV show IDs in our DB
  const { data: seriesRes } = await supabase.from('series_episodes').select('tmdb_id, stream_url');
  const availableIds = new Set<string>(seriesRes?.map((item: any) => item.tmdb_id.toString()) || []);
  const sourceMap = new Map<string, string>((seriesRes || []).map((item: any) => [item.tmdb_id.toString(), item.stream_url]));

  const [popTV, topTV] = await Promise.all([
    getPopular('tv'),
    getTopRated('tv')
  ]);

  const mapToMediaItem = (item: any) => ({
    id: item.id.toString(),
    tmdb_id: item.id.toString(),
    title: item.name,
    source_url: sourceMap.get(item.id.toString()) || '',
    poster_path: item.poster_path ? `${TMDB_IMAGE_CARD}${item.poster_path}` : null,
    type: 'series' as const
  });

  const availablePopular = popTV.filter(item => availableIds.has(item.id.toString())).map(mapToMediaItem);
  const availableTop = topTV.filter(item => availableIds.has(item.id.toString())).map(mapToMediaItem);
  
  const heroItem = availablePopular[0];

  return (
    <main className="dashboard-container">
      <MeshBackground />

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
          <div className="hero-badge flex items-center gap-2"><Tv className="w-4 h-4" /> SERIES ORIGINALES</div>
          <h1 className="hero-title">{heroItem?.title || 'Series en VivoTV'}</h1>
          
          <div className="flex flex-wrap items-center gap-8 text-sm font-bold text-white/40 uppercase tracking-widest mb-6">
            <div className="flex items-center gap-2 text-[#46d369]">
              <Star className="w-5 h-5 fill-current" />
              <span>Calidad Premium</span>
            </div>
            <span>Serie</span>
            <span className="px-2 py-0.5 border border-white/20 rounded text-[9px]">FULL HD 1080P</span>
          </div>

          <p className="text-xl text-white/60 max-w-2xl leading-relaxed mb-8 font-bold">
            Maratonea las mejores producciones internacionales con doblaje y subtítulos premium.
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

      <div className="catalogs-wrapper px-[var(--side-padding)] -mt-32 relative z-20 space-y-24">
        <section>
          <div className="row-header mb-8">
             <h3 className="section-title">📺 Series Populares</h3>
          </div>
          <Suspense fallback={<div className="h-64 bg-white/5 animate-pulse rounded-3xl" />}>
            <MediaLibrary catalog={availablePopular.slice(1)} />
          </Suspense>
        </section>

        <section>
          <div className="row-header mb-8">
             <h3 className="section-title">⭐ Recomendado por Críticos</h3>
          </div>
          <Suspense fallback={<div className="h-64 bg-white/5 animate-pulse rounded-3xl" />}>
            <MediaLibrary catalog={availableTop} />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
