'use client';

import { useState } from 'react';
import Image from 'next/image';
import PlayerModal from '@/components/PlayerModal';
import { Play } from 'lucide-react';

type MediaItem = {
  id?: string;
  tmdb_id: string;
  title: string;
  source_url: string;
  poster_path: string | null;
  type: 'movie' | 'series' | 'anime';
};

export default function MediaLibrary({ catalog }: { catalog: MediaItem[] }) {
  const [activeVideo, setActiveVideo] = useState<MediaItem | null>(null);

  return (
    <section>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-4 md:gap-6">
        {catalog.map((item, idx) => (
          <div 
            key={`${item.tmdb_id}-${idx}`} 
            onClick={() => setActiveVideo(item)}
            className="group relative aspect-[2/3] bg-surface rounded-xl overflow-hidden cursor-pointer border border-white/5 hover:border-primary/50 transition-all duration-300 shadow-xl hover:shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:-translate-y-2"
          >
            {item.poster_path ? (
              <Image 
                src={item.poster_path}
                alt={item.title || 'Movie Poster'}
                fill
                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                unoptimized // Permite usar URLs directas de TMDB sin configuración extensa en Next.js
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-surface-high p-4 text-center">
                <span className="text-white/40 font-bold text-lg">{item.title}</span>
              </div>
            )}
            
            {/* Play Overlay Overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center transform scale-50 group-hover:scale-100 transition-transform duration-300 delay-100">
                <Play className="w-6 h-6 text-white ml-1" fill="currentColor" />
              </div>
            </div>

            {/* Badges */}
            <div className="absolute top-2 left-2 px-2 py-1 bg-black/80 backdrop-blur-md rounded text-[10px] font-black tracking-widest uppercase border border-white/10 text-white/80">
              {item.type}
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
