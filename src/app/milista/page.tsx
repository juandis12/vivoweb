'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import MeshBackground from '@/components/MeshBackground';
import { Bookmark, Search } from 'lucide-react';
import Link from 'next/link';

export default function MiListaPage() {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadFavorites() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: favs } = await supabase
        .from('user_favorites')
        .select('*')
        .eq('user_id', user.id);

      if (favs && favs.length > 0) {
        const enriched = await Promise.all(favs.map(async (f) => {
          try {
            const typeStr = f.type === 'movie' ? 'movie' : 'tv';
            const tmdb = await fetchTMDB(`/${typeStr}/${f.tmdb_id}`);
            
            // Need to get stream URL too
            let streamUrl = '';
            if (f.type === 'movie') {
               const { data: res } = await supabase.from('video_sources').select('stream_url').eq('tmdb_id', f.tmdb_id).single();
               streamUrl = res?.stream_url || '';
            } else {
               const { data: res } = await supabase.from('series_episodes').select('stream_url').eq('tmdb_id', f.tmdb_id).limit(1).single();
               streamUrl = res?.stream_url || '';
            }

            return {
              tmdb_id: f.tmdb_id.toString(),
              title: tmdb?.title || tmdb?.name || 'Cargando...',
              source_url: streamUrl,
              poster_path: tmdb?.poster_path ? `${TMDB_IMAGE_CARD}${tmdb.poster_path}` : null,
              type: f.type
            };
          } catch (e) {
            return null;
          }
        }));
        setFavorites(enriched.filter((i: any) => i !== null));
      }
      setLoading(false);
    }
    loadFavorites();
  }, [supabase]);

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-[#0b122b]">
       <div className="w-16 h-16 border-8 border-[var(--primary)] border-t-transparent rounded-full animate-spin shadow-2xl" />
    </div>
  );

  return (
    <main className="page-container relative overflow-hidden">
      <MeshBackground />
      
      <header className="section-header">
         <h1 className="section-title">Mi Lista Personalizada</h1>
         <p className="text-white/40 font-bold uppercase tracking-widest text-sm">Tus favoritos en un solo lugar premium.</p>
      </header>

      <div className="mt-12">
        {favorites.length > 0 ? (
          <MediaLibrary catalog={favorites} />
        ) : (
          <div className="empty-state py-32 flex flex-col items-center gap-6">
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center text-5xl">📂</div>
            <h2 className="text-2xl font-black uppercase">Tu lista está vacía</h2>
            <p className="text-white/40 max-w-sm text-center">Añade contenido usando el botón de favoritos en los detalles de cualquier título.</p>
            <Link href="/" className="btn btn-primary">
               EXPLORAR CONTENIDO
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
