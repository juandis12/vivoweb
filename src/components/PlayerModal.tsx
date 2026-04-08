'use client';

import { useState, useEffect } from 'react';
import { X, Play, Info, Star, Calendar, Clock, Share2, Plus, Volume2 } from 'lucide-react';
import { fetchTMDB, TMDB_IMAGE_CARD } from '@/lib/tmdb';

export default function PlayerModal({ sourceUrl, tmdbId, onClose }: { sourceUrl: string; tmdbId: string; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'details' | 'player'>('details');
  const [details, setDetails] = useState<any>(null);
  const [cast, setCast] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDetails() {
      try {
        let data = await fetchTMDB(`/movie/${tmdbId}`);
        let credits = await fetchTMDB(`/movie/${tmdbId}/credits`);
        if (!data) {
          data = await fetchTMDB(`/tv/${tmdbId}`);
          credits = await fetchTMDB(`/tv/${tmdbId}/credits`);
        }
        setDetails(data);
        setCast(credits?.cast?.slice(0, 6) || []);
      } catch (e) {
        console.error("Error loading modal details", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadDetails();
  }, [tmdbId]);

  if (!tmdbId) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel relative overflow-hidden">
        <button onClick={onClose} className="close-modal"><X className="w-6 h-6" /></button>

        {activeTab === 'details' ? (
          <div className="animate-fade h-full">
            {/* HEROPORT */}
            <div className="modal-viewport">
               <div className="absolute inset-0 -z-10 overflow-hidden">
                  <img src={details?.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : ''} alt="Backdrop" className="modal-backdrop opacity-30" />
                  <div className="modal-vignette" />
               </div>

               <div className="modal-hero-info">
                  <span className="btn btn-primary btn-sm mb-4" style={{ padding: '4px 12px', fontSize: '10px' }}>ULTRA HD 4K</span>
                  <h1 className="modal-main-title">{details?.title || details?.name}</h1>

                  <div className="modal-meta-row font-[Manrope] text-sm font-bold opacity-60">
                     <div className="flex items-center gap-2 text-[#46d369]"><Star className="w-4 h-4 fill-current" /> <span>9.2</span></div>
                     <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                     <span>{new Date(details?.release_date || details?.first_air_date || '').getFullYear()}</span>
                     <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                     <span>{details?.runtime} MIN</span>
                  </div>

                  <div className="flex items-center gap-5 pt-8">
                     <button onClick={() => setActiveTab('player')} className="btn btn-primary text-lg">
                        <Play className="w-6 h-6 fill-current" /> REPRODUCIR
                     </button>
                     <button className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 transition-all"><Plus className="w-6 h-6" /></button>
                     <button className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 transition-all"><Share2 className="w-6 h-6" /></button>
                  </div>
               </div>
            </div>

            {/* DETAILS GRID */}
            <div className="modal-details-grid grid lg:grid-cols-[1fr_300px] gap-12 p-12 overflow-y-auto max-h-[50vh]">
               <div className="space-y-8">
                  <div className="details-section">
                     <h3 className="text-white/40 text-xs font-black uppercase tracking-widest mb-3">Sinopsis</h3>
                     <p className="text-lg text-white/80 leading-relaxed font-bold">{details?.overview}</p>
                  </div>
                  {cast.length > 0 && (
                     <div className="details-section">
                        <h3 className="text-white/40 text-xs font-black uppercase tracking-widest mb-6">Reparto Principal</h3>
                        <div className="flex flex-wrap gap-6">
                           {cast.map(actor => (
                              <div key={actor.id} className="flex flex-col items-center gap-2 w-20">
                                 <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/10 shadow-xl">
                                    <img src={actor.profile_path ? `${TMDB_IMAGE_CARD}${actor.profile_path}` : 'https://via.placeholder.com/150'} alt={actor.name} className="w-full h-full object-cover" />
                                 </div>
                                 <span className="text-[10px] text-center font-bold truncate w-full">{actor.name}</span>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}
               </div>

               <div className="space-y-6 pt-7 border-l border-white/5 pl-8 hidden lg:block">
                  <div className="info-block"><span className="text-[10px] text-white/30 font-black uppercase tracking-widest">G├⌐neros</span><p className="font-bold text-sm">{details?.genres?.map((g:any) => g.name).join(', ')}</p></div>
                  <div className="info-block"><span className="text-[10px] text-white/30 font-black uppercase tracking-widest">Producci├│n</span><p className="font-bold text-sm">{details?.production_companies?.[0]?.name}</p></div>
                  <div className="info-block"><span className="text-[10px] text-white/30 font-black uppercase tracking-widest">Audio Original</span><p className="font-bold text-sm uppercase">{details?.original_language} (Surround)</p></div>
                  <button className="btn btn-secondary w-full text-xs font-black tracking-widest"><Volume2 className="w-4 h-4" /> MEJORAR AUDIO</button>
               </div>
            </div>
          </div>
        ) : (
          <div className="h-full bg-black flex flex-col animate-scaleIn">
              <div className="bg-[var(--bg-base)] p-4 flex items-center justify-between border-b border-white/5">
                 <button onClick={() => setActiveTab('details')} className="btn btn-secondary btn-sm text-[10px]"><Info className="w-4 h-4" /> INFO</button>
                 <span className="text-sm font-black italic text-[var(--primary)] uppercase tracking-tighter">VivoTV Premium Player</span>
                 <div className="flex gap-4">
                    <button className="btn btn-sm text-white/50 hover:text-white transition-all"><Share2 className="w-4 h-4" /></button>
                 </div>
              </div>
              <div className="flex-1 bg-black overflow-hidden">
                <iframe src={sourceUrl} className="w-full h-full border-none shadow-2xl" allowFullScreen sandbox="allow-forms allow-pointer-lock allow-same-origin allow-scripts allow-top-navigation" />
              </div>
          </div>
        )}
      </div>
    </div>
  );
}
