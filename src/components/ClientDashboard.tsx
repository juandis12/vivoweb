'use client';

import React from 'react';
import { useSession } from '@/context/SessionContext';
import { filterItemsByProfile } from '@/utils/filterContent';
import HeroBanner from './HeroBanner';
import MediaLibrary from './MediaLibrary';
import { Clock, Award, Play, Star } from 'lucide-react';

interface ClientDashboardProps {
  initialTrending: any[];
  initialPopularMovies: any[];
  initialPopularSeries: any[];
  initialTopRated: any[];
  initialHistory: any[];
}

export default function ClientDashboard({ 
  initialTrending, 
  initialPopularMovies, 
  initialPopularSeries, 
  initialTopRated, 
  initialHistory 
}: ClientDashboardProps) {
  const { currentProfile } = useSession();
  const isKids = currentProfile?.is_kids || false;

  // Apply Parental Filtering to all data
  const trending = filterItemsByProfile(initialTrending, isKids);
  const popularMovies = filterItemsByProfile(initialPopularMovies, isKids);
  const popularSeries = filterItemsByProfile(initialPopularSeries, isKids);
  const topRated = filterItemsByProfile(initialTopRated, isKids);
  const history = filterItemsByProfile(initialHistory, isKids);

  const handlePlay = (item: any) => {
    // This will open the player modal (to be implemented/integrated)
    window.dispatchEvent(new CustomEvent('open-movie-detail', { detail: { tmdbId: item.id, type: item.type } }));
  };

  const handleInfo = (item: any) => {
    window.dispatchEvent(new CustomEvent('open-movie-detail', { detail: { tmdbId: item.id, type: item.type } }));
  };

  return (
    <div className="dashboard-content animate-in fade-in duration-700">
      <HeroBanner 
        items={trending} 
        onPlay={handlePlay} 
        onInfo={handleInfo} 
      />

      <div className="catalogs-wrapper px-[var(--side-padding)] -mt-32 relative z-20 space-y-24 pb-24">
        {history.length > 0 && (
          <section className="catalog-row">
            <div className="row-header mb-8">
               <h3 className="section-title flex items-center gap-3">
                 <Clock className="w-8 h-8 text-[var(--primary)]" /> Continuar Viendo
               </h3>
            </div>
            <MediaLibrary catalog={history} />
          </section>
        )}

        <section className="catalog-row">
          <div className="row-header mb-8">
             <h3 className="section-title flex items-center gap-3">
               <Award className="w-8 h-8 text-yellow-500" /> Tendencias de Hoy
             </h3>
          </div>
          <MediaLibrary catalog={trending.slice(0, 15)} />
        </section>

        <section className="catalog-row">
          <div className="row-header mb-8">
             <h3 className="section-title flex items-center gap-3">
               <Play className="w-8 h-8 text-[var(--primary)]" /> Series Originales
             </h3>
          </div>
          <MediaLibrary catalog={popularSeries} />
        </section>

        <section className="catalog-row">
          <div className="row-header mb-8">
             <h3 className="section-title flex items-center gap-3">
               <Star className="w-8 h-8 text-yellow-500" /> Los Favoritos de la Crítica
             </h3>
          </div>
          <MediaLibrary catalog={topRated} />
        </section>

        <section className="catalog-row">
          <div className="row-header mb-8">
             <h3 className="section-title flex items-center gap-3">
               <Film className="w-8 h-8 text-[var(--primary)]" /> Películas Populares
             </h3>
          </div>
          <MediaLibrary catalog={popularMovies} />
        </section>
      </div>
    </div>
  );
}

// Simple Film icon replacement since it was missing in import
import { Film } from 'lucide-react';
