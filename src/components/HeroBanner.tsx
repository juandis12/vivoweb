'use client';

import React, { useState, useEffect } from 'react';
import { Play, Info } from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import { filterItemsByProfile } from '@/utils/filterContent';

interface HeroBannerProps {
  items: any[];
  onPlay: (item: any) => void;
  onInfo: (item: any) => void;
}

export default function HeroBanner({ items, onPlay, onInfo }: HeroBannerProps) {
  const { currentProfile } = useSession();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Apply Parental Filter to Hero items
  const filteredItems = filterItemsByProfile(items, currentProfile?.is_kids || false).slice(0, 8);
  const currentItem = filteredItems[currentIndex];

  useEffect(() => {
    if (filteredItems.length <= 1) return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % filteredItems.length);
        setIsTransitioning(false);
      }, 500); // Sync with CSS transition
    }, 8000); // 8s rotation as per legacy

    return () => clearInterval(interval);
  }, [filteredItems.length]);

  if (!currentItem) return null;

  const bgUrl = `https://image.tmdb.org/t/p/original${currentItem.backdrop_path}`;

  return (
    <section 
      className={`hero-banner relative w-full h-[85vh] flex items-center transition-opacity duration-500 ${isTransitioning ? 'opacity-0' : 'opacity-1'}`}
      style={{
        backgroundImage: `linear-gradient(to right, #0b122b 0%, rgba(11, 18, 43, 0.8) 30%, transparent 100%), url(${bgUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="container mx-auto px-6 md:px-12 z-10 max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <span className="bg-[var(--primary)] text-white text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider">
            Trending
          </span>
          <span className="text-white/60 text-sm font-medium">
            #{(currentIndex + 1)} en VivoTV hoy
          </span>
        </div>

        <h1 className="text-4xl md:text-6xl font-black text-white mb-4 leading-tight drop-shadow-2xl">
          {currentItem.title || currentItem.name}
        </h1>

        <p className="text-lg text-white/70 mb-8 line-clamp-3 md:line-clamp-4 max-w-xl font-medium leading-relaxed">
          {currentItem.overview}
        </p>

        <div className="flex flex-wrap gap-4">
          <button 
            className="flex items-center gap-3 bg-white text-[#0b122b] px-8 py-4 rounded-2xl font-bold hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-xl"
            onClick={() => onPlay(currentItem)}
          >
            <Play fill="currentColor" size={24} />
            Reproducir
          </button>
          <button 
            className="flex items-center gap-3 bg-white/10 backdrop-blur-md text-white px-8 py-4 rounded-2xl font-bold hover:bg-white/20 transition-all border border-white/10 shadow-xl"
            onClick={() => onInfo(currentItem)}
          >
            <Info size={24} />
            Más información
          </button>
        </div>
      </div>

      <div className="absolute bottom-10 right-12 flex gap-2 z-20">
        {filteredItems.map((_, i) => (
          <div 
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${i === currentIndex ? 'w-8 bg-[var(--primary)]' : 'w-4 bg-white/20'}`}
          />
        ))}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-[#0b122b] via-transparent to-transparent" />
    </section>
  );
}
