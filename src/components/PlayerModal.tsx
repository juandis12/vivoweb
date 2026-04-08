'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function PlayerModal({ 
  sourceUrl, 
  tmdbId, 
  onClose 
}: { 
  sourceUrl: string | null; 
  tmdbId: string;
  onClose: () => void 
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const supabase = createClient();
  const [elapsed, setElapsed] = useState(0);

  // EFECTO: Lógica de Telemetría Robusta (Fase 4 - Prevención de Fugas de Memoria)
  useEffect(() => {
    if (!sourceUrl) return;

    let intervalId: NodeJS.Timeout;
    let ticks = 0;
    let localElapsed = 0;
    let lastSavedElapsed = -1;

    const doSaveIframe = async () => {
      if (localElapsed !== lastSavedElapsed && localElapsed > 0) {
        // Enviar a Base de datos de forma segura
        const { error: rpcError } = await supabase.rpc('update_user_progress', {
          p_tmdb_id: tmdbId,
          p_seconds: localElapsed
        });
        
        if (rpcError) {
          console.error('Error telemetry:', rpcError);
        }
        
        lastSavedElapsed = localElapsed;
      }
    };

    // Tracker que corre cada 15 segundos pero solo guarda cada 60s
    intervalId = setInterval(() => {
      localElapsed += 15;
      ticks++;
      if (ticks % 4 === 0) {
        doSaveIframe(); // Debounced save
      }
    }, 15000);

    // Visibility Checker: Si cambia pestaña, guardamos progreso.
    const handleVis = () => {
      if (document.hidden) doSaveIframe();
    };
    
    document.addEventListener('visibilitychange', handleVis);
    window.addEventListener('beforeunload', doSaveIframe);

    return () => {
      // CLEANUP ESTRICTO: Sin memory leaks
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVis);
      window.removeEventListener('beforeunload', doSaveIframe);
      doSaveIframe(); // Guardado final al cerrar modal
    };
  }, [sourceUrl, tmdbId]);

  if (!sourceUrl) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-sm">
      {/* Botón Salir Superior */}
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 z-50 text-white/50 hover:text-white bg-white/10 hover:bg-white/20 p-3 rounded-full transition-all"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6 stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>

      {/* Frame Seguro Sandbox */}
      <div className="w-full max-w-6xl aspect-video rounded-xl overflow-hidden shadow-[0_0_80px_rgba(37,99,235,0.2)] bg-black relative border border-white/10">
        <iframe 
          ref={iframeRef}
          src={sourceUrl}
          className="w-full h-full border-none"
          allow="autoplay; fullscreen; encrypted-media"
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
