'use client';

import { createClient } from '@/utils/supabase/client';
import { X, Maximize, Minimize } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface PlayerModalProps {
  sourceUrl: string;
  tmdbId: string;
  onClose: () => void;
}

export default function PlayerModal({ sourceUrl, tmdbId, onClose }: PlayerModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const startTime = useRef(Date.now());

  // Sistema de telemetr├¡a (Progreso)
  useEffect(() => {
    const timer = setInterval(async () => {
      const elapsedSeconds = Math.floor((Date.now() - startTime.current) / 1000);
      
      // Llamada al RPC 'update_user_progress' que ahora apunta a columns reales
      await supabase.rpc('update_user_progress', {
        p_tmdb_id: parseInt(tmdbId),
        p_seconds: elapsedSeconds
      });
    }, 60000); // Guardar cada minuto

    return () => clearInterval(timer);
  }, [tmdbId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-in fade-in duration-500">
      <div 
        ref={containerRef}
        className="relative w-full h-full md:w-[90vw] md:h-[80vh] bg-black rounded-none md:rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(37,99,235,0.4)] border border-white/10"
      >
        {/* Cabecera del Player */}
        <div className="absolute top-0 inset-x-0 p-6 flex justify-between items-center z-50 bg-gradient-to-b from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300">
          <h2 className="text-white font-black uppercase tracking-widest text-sm">Reproduciendo ahora</h2>
          <div className="flex gap-4">
            <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors">
              {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
            </button>
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Iframe Protegido */}
        <iframe
          src={sourceUrl}
          className="w-full h-full border-0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          sandbox="allow-forms allow-pointer-lock allow-same-origin allow-scripts allow-top-navigation"
        />
      </div>
    </div>
  );
}
