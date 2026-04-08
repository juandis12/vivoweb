'use client';

import React from 'react';
import { useSession } from '@/context/SessionContext';
import { useRouter } from 'next/navigation';

interface ExitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExitModal({ isOpen, onClose }: ExitModalProps) {
  const { logout, setCurrentProfile } = useSession();
  const router = useRouter();

  if (!isOpen) return null;

  const handleSwitchProfile = () => {
    setCurrentProfile(null);
    onClose();
    router.push('/profiles');
  };

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050918]/90 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="exit-modal-content w-[90%] max-w-md p-8 bg-[#0b122b] border border-white/10 rounded-3xl shadow-2xl text-center animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold text-white mb-2">¿A dónde quieres ir?</h2>
        <p className="text-white/60 mb-8">Selecciona una opción para continuar.</p>
        
        <div className="flex flex-col gap-3">
          <button 
            className="w-full py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            onClick={handleSwitchProfile}
          >
            Elegir otro perfil
          </button>
          <button 
            className="w-full py-4 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-2xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            onClick={handleLogout}
          >
            Cerrar sesión de la cuenta
          </button>
          <button 
            className="w-full py-4 bg-transparent text-white/40 hover:text-white rounded-2xl font-semibold transition-all mt-2"
            onClick={onClose}
          >
            Volver
          </button>
        </div>
      </div>
    </div>
  );
}
