'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Plus, PlusCircle, Settings, Edit3 } from 'lucide-react';

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
        router.push('/login');
        return;
      }

      const { data } = await supabase
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

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-base">
       <div className="w-16 h-16 border-8 border-primary border-t-transparent rounded-full animate-spin shadow-2xl" />
    </div>
  );

  return (
    <main className="h-screen flex flex-col items-center justify-center bg-base px-6 relative overflow-hidden">
      
      {/* Background Gradients (Aura Style) */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 blur-[150px] -z-10 animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-accent/10 blur-[150px] -z-10 animate-pulse delay-1000" />

      <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-20 uppercase text-center animate-fade">
        ¿Qui├⌐n est├í viendo <span className="text-primary neon-text">VIVOTV</span>?
      </h1>

      <div className="flex flex-wrap justify-center gap-10 max-w-6xl">
        {profiles.map((profile, idx) => (
          <button
            key={profile.id}
            onClick={() => selectProfile(profile)}
            className="group flex flex-col items-center space-y-6 transition-transform hover:scale-105 animate-fade"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            <div 
              className="w-40 h-40 md:w-52 md:h-52 rounded-3xl overflow-hidden glass border-4 border-transparent group-hover:border-primary transition-all shadow-2xl relative flex items-center justify-center group-hover:shadow-[0_0_50px_rgba(99,102,241,0.3)]"
              style={{ backgroundColor: `${profile.color}22` }}
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
              ) : (
                <div 
                  className="w-full h-full flex items-center justify-center transition-colors group-hover:bg-primary/20"
                  style={{ color: profile.color }}
                >
                   <User className="w-20 h-20 md:w-28 md:h-28 fill-current" />
                </div>
              )}
              
              {/* Edit Hover Overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                 <div className="p-3 bg-white/20 backdrop-blur-md rounded-full border border-white/20">
                    <Edit3 className="w-6 h-6 text-white" />
                 </div>
              </div>
            </div>
            
            <span className="text-xl md:text-2xl font-black text-white/50 group-hover:text-white uppercase tracking-widest transition-colors drop-shadow-md">
              {profile.name}
            </span>
          </button>
        ))}

        {/* AGREGAR PERFIL (Apple TV Plus Style) */}
        <button className="group flex flex-col items-center space-y-6 transition-transform hover:scale-105 animate-fade opacity-60 hover:opacity-100">
          <div className="w-40 h-40 md:w-52 md:h-52 rounded-3xl border-4 border-dashed border-white/10 flex items-center justify-center group-hover:border-white/30 transition-all bg-white/5 overflow-hidden relative">
             <Plus className="w-16 h-16 text-white/20 group-hover:text-white/40" />
             <div className="absolute inset-0 bg-gradient-to-br from-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="text-xl md:text-2xl font-black text-white/20 group-hover:text-white/40 uppercase tracking-widest">
            A├▒adir
          </span>
        </button>
      </div>

      <div className="mt-24 flex items-center gap-6 animate-fade">
         <button className="px-10 py-3 border-2 border-white/10 rounded-2xl text-white/30 font-black uppercase tracking-widest hover:text-white hover:border-primary hover:bg-primary/10 transition-all flex items-center gap-3 active:scale-95 shadow-xl">
            <Settings className="w-5 h-5" /> Gestionar perfiles
         </button>
      </div>
    </main>
  );
}
