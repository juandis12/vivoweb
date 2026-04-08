'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import MeshBackground from '@/components/MeshBackground';
import { useSession } from '@/context/SessionContext';
import { filterItemsByProfile } from '@/utils/filterContent';
import Link from 'next/link';

export default function MiListaPage() {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentProfile } = useSession();
  const supabase = createClient();

  useEffect(() => {
    async function loadFavorites() {
      if (!currentProfile) {
        setLoading(false);
        return;
      }

      const { data: favs } = await supabase
        .from('user_favorites')
        .select('*')
        .eq('profile_id', currentProfile.id);

      if (favs && favs.length > 0) {
        const enriched = await Promise.all(favs.map(async (f) => {
          try {
            const typeStr = f.type === 'movie' ? 'movie' : 'tv';
            const tmdb = await fetchTMDB(`/${typeStr}/${f.tmdb_id}`);
            if (!tmdb) return null;

            // Get stream URL based on type
            let streamUrl = '';
            if (f.type === 'movie') {
               const { data: res } = await supabase.from('video_sources').select('stream_url').eq('tmdb_id', f.tmdb_id).single();
               streamUrl = res?.stream_url || '';
            } else {
               const { data: res } = await supabase.from('series_episodes').select('stream_url').eq('tmdb_id', f.tmdb_id).limit(1).single();
               streamUrl = res?.stream_url || '';
            }

            return {
              id: f.tmdb_id.toString(),
              tmdb_id: f.tmdb_id.toString(),
              title: tmdb?.title || tmdb?.name || 'Cargando...',
              source_url: streamUrl,
              poster_path: tmdb?.poster_path ? `${TMDB_IMAGE_CARD}${tmdb.poster_path}` : null,
              type: f.type,
              genre_ids: tmdb?.genre_ids || []
            };
          } catch (e) {
            return null;
          }
        }));

        const validFavorites = enriched.filter((i: any) => i !== null);
        // Enforce Parental Filtering even on favorites
        const filteredFavorites = filterItemsByProfile(validFavorites, currentProfile.is_kids);
        setFavorites(filteredFavorites);
      } else {
        setFavorites([]);
      }
      setLoading(false);
    }
    loadFavorites();
  }, [currentProfile, supabase]);

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-[#0b122b]">
       <div className="w-16 h-16 border-8 border-[var(--primary)] border-t-transparent rounded-full animate-spin shadow-2xl" />
    </div>
  );

  return (
    <main className="page-container relative overflow-hidden min-h-screen pt-32 pb-24">
      <MeshBackground />
      
      <div className="container mx-auto px-[var(--side-padding)] relative z-10">
        <header className="mb-16">
           <h1 className="text-4x md:text-6xl font-black text-white mb-4 uppercase italic italic tracking-tighter">Mi Biblioteca Personal</h1>
           <p className="text-white/40 font-bold uppercase tracking-widest text-sm">Contenido guardado por {currentProfile?.name || 'ti'}</p>
        </header>

        <div className="favorites-content">
          {favorites.length > 0 ? (
            <MediaLibrary catalog={favorites} />
          ) : (
            <div className="empty-state py-32 flex flex-col items-center gap-8 bg-white/5 rounded-[40px] border border-white/10 backdrop-blur-3xl">
              <div className="w-32 h-32 bg-[var(--primary)]/20 text-[var(--primary)] rounded-full flex items-center justify-center text-6xl animate-pulse">
                ❤
              </div>
              <div className="text-center">
                <h2 className="text-3xl font-black uppercase text-white mb-4">Aún no tienes favoritos</h2>
                <p className="text-white/40 max-w-sm mx-auto mb-8 font-medium">Guarda lo que más te gusta para tenerlo siempre a mano en todos tus dispositivos.</p>
                <Link href="/" className="inline-block bg-white text-[#0b122b] px-10 py-4 rounded-2xl font-black hover:scale-105 transition-transform active:scale-95 shadow-2xl">
                   DESCUBRIR CONTENIDO
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
