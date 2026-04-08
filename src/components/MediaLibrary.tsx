'use client';

import { useState, useEffect } from 'react';
import PlayerModal from '@/components/PlayerModal';
import { Play, Heart, Check } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

type MediaItem = {
  id?: string;
  tmdb_id: string;
  title: string;
  source_url: string;
  poster_path: string | null;
  type?: 'movie' | 'series' | 'anime';
  label?: string;
};

export default function MediaLibrary({ catalog }: { catalog: MediaItem[] }) {
  const [activeVideo, setActiveVideo] = useState<MediaItem | null>(null);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const supabase = createClient();

  useEffect(() => {
    async function loadFavs() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('user_favorites').select('tmdb_id').eq('user_id', user.id);
      if (data) {
        const favMap: Record<string, boolean> = {};
        data.forEach(f => favMap[f.tmdb_id.toString()] = true);
        setFavorites(favMap);
      }
    }
    loadFavs();
  }, []);

  const toggleFavorite = async (e: React.MouseEvent, item: MediaItem) => {
    e.stopPropagation();
    const isFav = favorites[item.tmdb_id];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert('Debes iniciar sesi├│n para guardar favoritos');

    if (isFav) {
      await supabase.from('user_favorites').delete().eq('user_id', user.id).eq('tmdb_id', item.tmdb_id);
      setFavorites(prev => ({ ...prev, [item.tmdb_id]: false }));
    } else {
      await supabase.from('user_favorites').insert({ 
        user_id: user.id, 
        tmdb_id: item.tmdb_id, 
        type: item.type === 'movie' ? 'movie' : 'series' 
      });
      setFavorites(prev => ({ ...prev, [item.tmdb_id]: true }));
    }
  };

  return (
    <section className="animate-fade">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {catalog.map((item, idx) => (
          <div 
            key={`${item.tmdb_id}-${idx}`}
            onClick={() => setActiveVideo(item)}
            className="group relative cursor-pointer"
          >
            {/* Tarjeta de Dise├▒o Premium */}
            <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden glass border-white/5 glow-hover shadow-2xl relative">
              
              {/* Imagen de Fondo */}
              {item.poster_path ? (
                <img 
                  src={item.poster_path} 
                  alt={item.title} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-surface to-base flex items-center justify-center p-6 text-center">
                   <h3 className="text-sm font-black uppercase tracking-widest text-white/20 select-none">{item.title}</h3>
                </div>
              )}

              {/* Overlay con Gradiente (Sutil) */}
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* Bot├│n Play Central */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-50 group-hover:scale-100">
                 <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center shadow-[0_0_30px_var(--primary-glow)]">
                    <Play className="w-8 h-8 text-white fill-white ml-1" />
                 </div>
              </div>

              {/* Badges de Categor├¡a */}
              <div className="absolute top-3 left-3 flex flex-col gap-2">
                 <div className="px-2 py-1 glass rounded-lg text-[10px] font-black uppercase tracking-tighter text-white/50 border border-white/10">
                   {item.type === 'movie' ? 'HD' : item.type === 'anime' ? 'ANIM' : '4K'}
                 </div>
              </div>

              {/* Bot├│n de Favorito Flotante */}
              <button 
                onClick={(e) => toggleFavorite(e, item)}
                className={`absolute top-3 right-3 p-2 rounded-xl backdrop-blur-xl border border-white/10 transition-all duration-300 ${favorites[item.tmdb_id] ? 'bg-primary border-primary shadow-lg scale-110' : 'bg-black/40 text-white/60 hover:text-white hover:bg-black/60'}`}
              >
                {favorites[item.tmdb_id] ? <Check className="w-4 h-4 text-white" /> : <Heart className="w-4 h-4" />}
              </button>
            </div>

            {/* Info inferior (Solo t├¡tulo) */}
            <div className="mt-4 px-1">
              <h3 className="text-sm font-bold text-white/80 truncate group-hover:text-primary transition-colors">{item.title}</h3>
              {item.label && <p className="text-[10px] text-primary font-black uppercase tracking-wide mt-0.5">{item.label}</p>}
            </div>
          </div>
        ))}
      </div>

      {activeVideo && (
        <PlayerModal 
          sourceUrl={activeVideo.source_url}
          tmdbId={activeVideo.tmdb_id?.toString() || '0'}
          onClose={() => setActiveVideo(null)}
        />
      )}
    </section>
  );
}
