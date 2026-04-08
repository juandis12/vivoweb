import { createClient } from '@/utils/supabase/server';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import { Suspense } from 'react';

export const revalidate = 3600;

interface CatalogItem {
  id?: string;
  tmdb_id: number;
  title?: string;
  video_url: string;
  content_type?: 'movie' | 'series';
}

interface MediaItem {
  id: string;
  tmdb_id: string;
  title: string;
  source_url: string;
  poster_path: string | null;
  type: 'movie' | 'series' | 'anime';
}

export default async function HomePage() {
  const supabase = await createClient();
  
  // CONSULTA REAL SEG├ÜN ESQUEMA: TABLA 'content'
  const { data: rawData, error: supabaseError } = await supabase
    .from('content')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  const rawCatalog = rawData as CatalogItem[] | null;
  
  const processCatalog = async (items: CatalogItem[]) => {
    return await Promise.all(
      items.map(async (item) => {
        let poster = null;
        let finalTitle = item.title || `ID: ${item.tmdb_id}`;

        try {
          if (item.tmdb_id) {
            const typeStr = item.content_type === 'movie' ? 'movie' : 'tv';
            const tmdbData = await fetchTMDB(`/${typeStr}/${item.tmdb_id}`);
            if (tmdbData) {
              poster = tmdbData.poster_path ? `${TMDB_IMAGE_CARD}${tmdbData.poster_path}` : null;
              finalTitle = tmdbData.title || tmdbData.name || finalTitle;
            }
          }
        } catch (tmdbErr) {
          console.error("TMDB error:", tmdbErr);
        }

        return {
          id: item.id || Math.random().toString(),
          tmdb_id: item.tmdb_id?.toString() || '0',
          title: finalTitle,
          source_url: item.video_url || '',
          poster_path: poster,
          type: item.content_type === 'movie' ? 'movie' : 'series'
        } as MediaItem;
      })
    );
  };

  const allItems = rawCatalog ? await processCatalog(rawCatalog) : [];
  const recentItems = allItems.slice(0, 12);
  const movies = allItems.filter(i => i.type === 'movie').slice(0, 6);
  const series = allItems.filter(i => i.type === 'series').slice(0, 6);

  return (
    <main className="pt-24 px-6 pb-24 max-w-7xl mx-auto space-y-16">
      <section className="w-full aspect-[4/3] md:aspect-[21/9] bg-surface-container rounded-3xl border border-white/5 flex items-end relative overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-t from-base via-base/80 to-transparent z-10" />
        <div className="z-20 p-8 md:p-14 w-full md:w-2/3">
          <div className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-black tracking-widest uppercase border border-white/10 inline-block mb-4 text-primary w-max">
            VIVOTV NEXT.JS
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-4 text-white drop-shadow-lg leading-none">
            {recentItems[0]?.title || 'CATÁLOGO VIVO'}
          </h1>
          <p className="text-white/60 text-lg md:text-xl line-clamp-2 select-none mb-6">
            Iniciando la nueva era de streaming desde tu base de datos Supabase.
          </p>
        </div>
        {recentItems[0]?.poster_path && (
           <img src={recentItems[0].poster_path} alt="Hero" className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-screen scale-105" />
        )}
      </section>

      <HomeSection title="Agregados Recientemente" items={recentItems} />
      <HomeSection title="Cine Premium" items={movies} />
      <HomeSection title="Series Tendencia" items={series} />

      {(!rawCatalog || rawCatalog.length === 0) && (
        <div className="p-12 text-center rounded-3xl border border-dashed border-white/10 bg-white/5">
          <p className="text-white/40 italic">
            {supabaseError ? `Error: ${supabaseError.message}` : 'La tabla "content" está conectada. ¡Empieza a agregar contenidos!'}
          </p>
        </div>
      )}
    </main>
  );
}

function HomeSection({ title, items }: { title: string; items: MediaItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between border-l-4 border-primary pl-4">
        <h2 className="text-2xl font-black tracking-tighter uppercase">{title}</h2>
      </div>
      <Suspense fallback={<div className="h-40 bg-surface animate-pulse rounded-xl" />}>
        <MediaLibrary catalog={items} />
      </Suspense>
    </section>
  );
}
