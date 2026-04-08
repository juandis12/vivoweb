'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useState } from 'react';

const PROFILES = [
  { id: 'damon', name: 'Damon', avatar: '/assets/avatars/avatar_damon.png' },
  { id: 'elena', name: 'Elena', avatar: '/assets/avatars/avatar_elena.png' },
  { id: 'ironman', name: 'Iron Man', avatar: '/assets/avatars/avatar_ironman.png' },
  { id: 'spiderman', name: 'Spider Man', avatar: '/assets/avatars/avatar_spiderman.png' },
  { id: 'tanjiro', name: 'Tanjiro', avatar: '/assets/avatars/avatar_tanjiro.png' },
  { id: 'wanda', name: 'Wanda', avatar: '/assets/avatars/avatar_wanda.png' },
  { id: 'woody', name: 'Woody', avatar: '/assets/avatars/avatar_woody.png' },
  { id: 'scott', name: 'Scott', avatar: '/assets/avatars/avatar_scott.png' }
];

export default function ProfilesPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (profile: typeof PROFILES[0]) => {
    setSelected(profile.id);
    // Persistencia Local
    localStorage.setItem('vivo_active_profile', JSON.stringify(profile));
    
    // Cookie para el servidor (opcional para middleware futuro)
    document.cookie = `vivo_profile_id=${profile.id}; path=/; max-age=31536000;`;

    // Navegar al Home con efecto
    setTimeout(() => {
      router.push('/');
    }, 800);
  };

  return (
    <main className="fixed inset-0 bg-base flex items-center justify-center z-[100] p-6 overflow-y-auto">
      <div className="w-full max-w-4xl text-center">
        <h1 className="text-4xl md:text-6xl font-black text-white mb-12 tracking-tighter animate-in fade-in slide-in-from-top-4 duration-700">
          ¿Quién está viendo?
        </h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {PROFILES.map((profile, i) => (
            <div 
              key={profile.id}
              onClick={() => handleSelect(profile)}
              className="group flex flex-col items-center gap-4 cursor-pointer animate-in fade-in zoom-in duration-500"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className={`
                relative w-32 h-32 md:w-40 md:h-40 rounded-2xl overflow-hidden border-4 transition-all duration-300
                ${selected === profile.id ? 'border-primary scale-110 shadow-[0_0_40px_rgba(37,99,235,0.6)]' : 'border-transparent group-hover:border-white group-hover:scale-105 shadow-2xl'}
              `}>
                <Image 
                  src={profile.avatar} 
                  alt={profile.name}
                  fill
                  className="object-cover"
                />
              </div>
              <span className={`text-lg font-bold transition-colors ${selected === profile.id ? 'text-primary' : 'text-white/50 group-hover:text-white'}`}>
                {profile.name}
              </span>
            </div>
          ))}
        </div>

        <button 
          onClick={() => router.push('/')}
          className="mt-16 px-8 py-3 bg-transparent border border-white/20 text-white/50 hover:text-white hover:border-white tracking-widest uppercase font-bold text-sm transition-all rounded-lg"
        >
          Administrar Perfiles
        </button>
      </div>
    </main>
  );
}
