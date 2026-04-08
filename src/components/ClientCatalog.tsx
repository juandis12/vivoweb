'use client';

import React from 'react';
import { useSession } from '@/context/SessionContext';
import { filterItemsByProfile } from '@/utils/filterContent';
import HeroBanner from './HeroBanner';
import MediaLibrary from './MediaLibrary';

interface ClientCatalogProps {
  initialPopular: any[];
  initialTopRated: any[];
  initialGenre1?: any[];
  initialGenre2?: any[];
  title: string;
  type: 'movie' | 'series' | 'anime';
}

export default function ClientCatalog({ 
  initialPopular, 
  initialTopRated, 
  initialGenre1 = [], 
  initialGenre2 = [],
  title,
  type
}: ClientCatalogProps) {
  const { currentProfile } = useSession();
  const isKids = currentProfile?.is_kids || false;

  // Apply Parental Filtering
  const popular = filterItemsByProfile(initialPopular, isKids);
  const topRated = filterItemsByProfile(initialTopRated, isKids);
  const genre1 = filterItemsByProfile(initialGenre1, isKids);
  const genre2 = filterItemsByProfile(initialGenre2, isKids);

  const handlePlay = (item: any) => {
    window.dispatchEvent(new CustomEvent('open-movie-detail', { detail: { tmdbId: item.id, type: item.type } }));
  };

  const handleInfo = (item: any) => {
    window.dispatchEvent(new CustomEvent('open-movie-detail', { detail: { tmdbId: item.id, type: item.type } }));
  };

  return (
    <div className="catalog-page-content animate-in fade-in duration-700">
      <HeroBanner 
        items={popular} 
        onPlay={handlePlay} 
        onInfo={handleInfo} 
      />

      <div className="catalogs-wrapper px-[var(--side-padding)] -mt-32 relative z-20 space-y-20 pb-24">
        <section className="catalog-row">
          <div className="row-header mb-8">
             <h3 className="section-title">{title} Populares</h3>
          </div>
          <MediaLibrary catalog={popular.slice(0, 15)} />
        </section>

        <section className="catalog-row">
          <div className="row-header mb-8">
             <h3 className="section-title">Lo más aclamado</h3>
          </div>
          <MediaLibrary catalog={topRated} />
        </section>

        {genre1.length > 0 && (
          <section className="catalog-row">
            <div className="row-header mb-8">
               <h3 className="section-title">Acción y Aventura</h3>
            </div>
            <MediaLibrary catalog={genre1} />
          </section>
        )}

        {genre2.length > 0 && (
          <section className="catalog-row">
            <div className="row-header mb-8">
               <h3 className="section-title">Comedia</h3>
            </div>
            <MediaLibrary catalog={genre2} />
          </section>
        )}
      </div>
    </div>
  );
}
