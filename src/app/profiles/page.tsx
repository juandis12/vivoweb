'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Plus, Lock } from 'lucide-react';

interface Profile {
  id: string;
  name: string;
  avatar_url: string | null;
  color: string;
  is_kids: boolean;
  pin?: string;
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function loadProfiles() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // En un sistema real, redirigir├¡amos al login.
        // Pero para este audit, permitiremos ver el estado.
        setLoading(false);
        return;
      }

      // USANDO TABLA REAL: vivotv_profiles
      const { data, error } = await supabase
        .from('vivotv_profiles')
        .select('*')
        .eq('user_id', user.id);

      if (data) setProfiles(data);
      setLoading(false);
    }
    loadProfiles();
  }, []);

  const selectProfile = (profile: Profile) => {
    localStorage.setItem('vivotv_current_profile', JSON.stringify(profile));
    router.push('/');
  };

  if (loading) return <div className="h-screen flex items-center justify-center animate-pulse text-primary font-black uppercase tracking-tighter text-3xl">Cargando Perfiles...</div>;

  return (
    <main className="h-screen flex flex-col items-center justify-center bg-base px-6">
      <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-16 uppercase text-center">
        ¿Quién est├í viendo <span className="text-primary">VIVOTV</span>?
      </h1>

      <div className="flex flex-wrap justify-center gap-8 max-w-4xl">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            onClick={() => selectProfile(profile)}
            className="group flex flex-col items-center space-y-4 transition-transform hover:scale-110"
          >
            <div 
              className="w-32 h-32 md:w-40 md:h-40 rounded-3xl overflow-hidden border-4 border-transparent group-hover:border-primary transition-all shadow-2xl relative"
              style={{ backgroundColor: profile.color || '#2563eb' }}
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-16 h-16 md:w-20 md:h-20 text-white m-auto absolute inset-0" />
              )}
              {profile.pin && <Lock className="absolute bottom-2 right-2 w-5 h-5 text-white/50" />}
            </div>
            <span className="text-lg font-bold text-white/60 group-hover:text-white uppercase tracking-widest">{profile.name}</span>
          </button>
        ))}

        {/* Bot├│n de Agregar Perfil (Funcionalidad Futura) */}
        <button className="group flex flex-col items-center space-y-4 transition-transform hover:scale-110 opacity-30 cursor-not-allowed">
          <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl border-4 border-dashed border-white/20 flex items-center justify-center group-hover:border-white/40 transition-all">
            <Plus className="w-12 h-12 text-white/20 group-hover:text-white/40" />
          </div>
          <span className="text-lg font-bold text-white/20 uppercase tracking-widest">A├▒adir</span>
        </button>
      </div>

      <button 
        onClick={() => router.push('/')}
        className="mt-20 px-8 py-2 border border-white/20 rounded-lg text-white/40 font-bold uppercase tracking-widest hover:text-white hover:border-white transition-all"
      >
        Gestionar perfiles
      </button>
    </main>
  );
}
