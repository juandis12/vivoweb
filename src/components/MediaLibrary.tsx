'use client';

import { useState, useEffect } from 'react';
import PlayerModal from '@/components/PlayerModal';
import { Play, Star, Plus, Info } from 'lucide-react';
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
    if (!user) return;

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
    <section>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-12">
        {catalog.map((item, idx) => (
          <div key={`${item.tmdb_id}-${idx}`} className="movie-card">
            
            {/* BASE CARD (POSTER) */}
            <div 
              onClick={() => setActiveVideo(item)}
              className="relative aspect-[2/3] bg-[var(--surface-container)] rounded-xl overflow-hidden shadow-2xl cursor-pointer border border-white/5"
            >
              {item.poster_path ? (
                <img src={item.poster_path} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-6 text-center text-xs font-black uppercase text-white/20">
                  {item.title}
                </div>
              )}
              
              {/* QUALITY BADGE */}
              <div className="absolute top-2 left-2 bg-yellow-500 text-black font-black text-[9px] px-1.5 py-0.5 rounded">HD</div>
              
              {/* PROGRESS BAR */}
              {item.label && (
                <div className="absolute bottom-0 left-0 w-full h-1 bg-black/40">
                  <div className="h-full bg-[var(--primary)] shadow-[0_0_10px_var(--primary-glow)]" style={{ width: '45%' }} />
                </div>
              )}
            </div>

            {/* EXPANDABLE TOOLTIP SEM├üNTICO */}
            <div className="movie-tooltip">
               <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-2">
                     <button className="w-9 h-9 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg">
                        <Play className="w-4 h-4 fill-current ml-1" />
                     </button>
                     <button 
                       onClick={(e) => toggleFavorite(e, item)}
                       className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${favorites[item.tmdb_id] ? 'bg-[var(--primary)] border-[var(--primary)] text-white' : 'bg-white/5 border-white/20 text-white hover:border-white'}`}
                     >
                        {favorites[item.tmdb_id] ? <Star className="w-4 h-4 fill-current" /> : <Plus className="w-4 h-4" />}
                     </button>
                  </div>
                  <button className="w-9 h-9 bg-white/5 border border-white/20 text-white rounded-full flex items-center justify-center hover:border-white">
                     <Info className="w-4 h-4" />
                  </button>
               </div>

               <div className="space-y-2">
                  <div className="flex items-center gap-3">
                     <span className="text-[#46d369] font-black text-xs">98% Match</span>
                     <span className="border border-white/40 text-[10px] text-white/60 px-1 rounded uppercase">Digital 4K</span>
                  </div>
                  <h4 className="text-sm font-black text-white truncate">{item.title}</h4>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                     <span>{item.type || 'Contenido'}</span>
                     <span className="w-1 h-1 bg-white/20 rounded-full" />
                     <span className="text-[var(--primary)]">{item.label || 'Estreno'}</span>
                  </div>
               </div>
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
