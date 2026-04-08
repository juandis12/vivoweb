'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';
import MediaLibrary from '@/components/MediaLibrary';
import MeshBackground from '@/components/MeshBackground';
import { Search as SearchIcon, X, Filter } from 'lucide-react';

function SearchResults() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const supabase = createClient();

  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    
    try {
      // 1. Search in TMDB for matched titles
      const movieRes = await fetchTMDB(`/search/movie?query=${encodeURIComponent(q)}`);
      const tvRes = await fetchTMDB(`/search/tv?query=${encodeURIComponent(q)}`);
      
      const allResults = [
        ...(movieRes?.results?.map((r: any) => ({ ...r, type: 'movie' })) || []),
        ...(tvRes?.results?.map((r: any) => ({ ...r, type: 'tv' })) || [])
      ];

      // 2. Filter only those present in our database
      const tmdbIds = allResults.map((r: any) => r.id.toString());
      
      const [moviesInDb, seriesInDb] = await Promise.all([
        supabase.from('video_sources').select('tmdb_id, stream_url').in('tmdb_id', tmdbIds),
        supabase.from('series_episodes').select('tmdb_id, stream_url').in('tmdb_id', tmdbIds)
      ]);

      const availableMap = new Map();
      moviesInDb.data?.forEach(m => availableMap.set(m.tmdb_id.toString(), m.stream_url));
      seriesInDb.data?.forEach(s => availableMap.set(s.tmdb_id.toString(), s.stream_url));

      const filtered = allResults
        .filter((r: any) => availableMap.has(r.id.toString()))
        .map((r: any) => ({
          tmdb_id: r.id.toString(),
          title: r.title || r.name,
          source_url: availableMap.get(r.id.toString()),
          poster_path: r.poster_path ? `${TMDB_IMAGE_CARD}${r.poster_path}` : null,
          type: r.type === 'movie' ? 'movie' : 'series'
        }));

      setResults(filtered);
    } catch (e) {
      console.error("Search error", e);
    } finally {
      setLoading(false);
    }
  };

  const filteredResults = results.filter((r: any) => filter === 'all' || r.type === filter);

  return (
    <div className="w-full">
      <header className="search-hero text-center pt-24 pb-12">
        <h1 className="text-4xl md:text-6xl font-black mb-4 uppercase italic tracking-tighter">Busca tu Próxima Historia</h1>
        <p className="text-white/40 font-bold uppercase tracking-widest text-sm mb-12">Explora el catálogo completo de VivoTV Premium.</p>
        
        <div className="max-w-2xl mx-auto relative px-4">
          <div className="search-input-wrapper relative">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20">
              <SearchIcon size={28} />
            </div>
            <input 
              type="text" 
              className="w-full bg-white/5 border border-white/10 rounded-full py-6 pl-16 pr-8 text-xl font-bold focus:border-[var(--primary)] outline-none transition-all shadow-2xl backdrop-blur-xl"
              placeholder="Películas, series, géneros..." 
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // Debounce simple
                const t = setTimeout(() => handleSearch(e.target.value), 500);
                return () => clearTimeout(t);
              }}
            />
          </div>

          <div className="flex justify-center gap-4 mt-8">
            {(['all', 'movie', 'tv'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:text-white'}`}
              >
                {f === 'all' ? 'Todos' : f === 'movie' ? 'Películas' : 'Series'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mt-12 px-[var(--side-padding)] pb-24">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {[1,2,3,4,5,6].map(i => <div key={i} className="aspect-[2/3] bg-white/5 animate-pulse rounded-xl" />)}
          </div>
        ) : filteredResults.length > 0 ? (
          <MediaLibrary catalog={filteredResults} />
        ) : query && (
          <div className="empty-state py-32 flex flex-col items-center gap-6">
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center text-5xl">🔍</div>
            <h2 className="text-2xl font-black uppercase">No encontramos coincidencias</h2>
            <p className="text-white/40 max-w-sm text-center">Prueba con otros términos como "Acción", "Naruto" o el nombre de un actor.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      <MeshBackground />
      <Suspense fallback={null}>
        <SearchResults />
      </Suspense>
    </main>
  );
}
