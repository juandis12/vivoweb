'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

export default function Toast({ message, type, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, 4000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle className="text-green-400" size={24} />,
    error: <AlertCircle className="text-red-400" size={24} />,
    info: <Info className="text-blue-400" size={24} />
  };

  const bgColors = {
    success: 'bg-green-500/10 border-green-500/20',
    error: 'bg-red-500/10 border-red-500/20',
    info: 'bg-[var(--primary)]/10 border-[var(--primary)]/20'
  };

  return (
    <div 
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[10001] w-[90%] max-w-sm p-4 rounded-2xl border backdrop-blur-3xl shadow-2xl flex items-center gap-4 transition-all duration-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'} ${bgColors[type]}`}
    >
      <div className="shrink-0">
        {icons[type]}
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-white leading-tight">{message}</p>
      </div>
      <button 
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        className="text-white/20 hover:text-white transition-colors"
      >
        <X size={18} />
      </button>
    </div>
  );
}
