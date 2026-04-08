'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/context/SessionContext';
import { Plus, Edit3, Trash2, Lock, Unlock } from 'lucide-react';

interface Profile {
  id: string;
  name: string;
  avatar_url: string | null;
  color: string;
  is_kids: boolean;
  pin: string | null;
  last_heartbeat: string | null;
}

const AVATAR_LIST = [
  { id: 'spiderman', name: 'Spider-man', url: '/assets/avatars/avatar_spiderman.png' },
  { id: 'ironman', name: 'Iron Man', url: '/assets/avatars/avatar_ironman.png' },
  { id: 'wanda', name: 'Wanda', url: '/assets/avatars/avatar_wanda.png' },
  { id: 'scott', name: 'Scott McCall', url: '/assets/avatars/avatar_scott.png' },
  { id: 'damon', name: 'Damon', url: '/assets/avatars/avatar_damon.png' },
  { id: 'elena', name: 'Elena', url: '/assets/avatars/avatar_elena.png' },
  { id: 'tanjiro', name: 'Tanjiro', url: '/assets/avatars/avatar_tanjiro.png' },
  { id: 'woody', name: 'Woody', url: '/assets/avatars/avatar_woody.png' }
];

export default function ProfilesPage() {
  const { setCurrentProfile } = useSession();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  
  // Modals
  const [showPinPad, setShowPinPad] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinMode, setPinMode] = useState<'locked' | 'create'>('locked');
  
  const [serverNow, setServerNow] = useState<number>(Date.now());
  const supabase = createClient();
  const router = useRouter();

  // Load profiles and sync time
  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Sync with DB
      const { data, error } = await supabase.from('vivotv_profiles').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
      
      if (data) {
        setProfiles(data);
      }
      setLoading(false);
    }
    loadData();

    const interval = setInterval(() => setServerNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [supabase, router]);

  const isOccupied = (p: Profile) => {
    if (!p.last_heartbeat) return false;
    const last = new Date(p.last_heartbeat).getTime();
    const diff = (serverNow - last) / 1000;
    return diff < 30; // 30 seconds threshold
  };

  const handleProfileClick = (profile: Profile) => {
    if (isEditing) {
      setEditingProfileId(profile.id);
      setShowAvatarPicker(true);
      return;
    }

    if (isOccupied(profile)) {
      alert("Este perfil está en uso activo en otro dispositivo.");
      return;
    }

    if (profile.pin) {
      setPinMode('locked');
      setActiveProfile(profile);
      setShowPinPad(true);
      setEnteredPin('');
    } else {
      finalizeSelection(profile);
    }
  };

  const finalizeSelection = (profile: Profile) => {
    setCurrentProfile(profile);
    router.push('/');
  };

  const handlePinPress = (key: string) => {
    if (key === 'back') {
      setEnteredPin(prev => prev.slice(0, -1));
      return;
    }

    const nextPin = enteredPin + key;
    if (nextPin.length <= 4) {
      setEnteredPin(nextPin);
      
      if (nextPin.length === 4) {
        if (pinMode === 'locked') {
          if (nextPin === activeProfile?.pin) {
            finalizeSelection(activeProfile!);
          } else {
            alert("PIN Incorrecto");
            setEnteredPin('');
          }
        } else if (pinMode === 'create') {
          updateProfilePin(activeProfile!.id, nextPin);
          setShowPinPad(false);
        }
      }
    }
  };

  const updateProfilePin = async (id: string, newPin: string | null) => {
    const { error } = await supabase
      .from('vivotv_profiles')
      .update({ pin: newPin })
      .eq('id', id);
    
    if (!error) {
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, pin: newPin } : p));
    }
  };

  const updateProfileName = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    const { error } = await supabase
      .from('vivotv_profiles')
      .update({ name: newName })
      .eq('id', id);
    
    if (!error) {
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
    }
  };

  const updateAvatar = async (avatarUrl: string) => {
    if (!editingProfileId) return;
    const { error } = await supabase
      .from('vivotv_profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', editingProfileId);
    
    if (!error) {
      setProfiles(prev => prev.map(p => p.id === editingProfileId ? { ...p, avatar_url: avatarUrl } : p));
    }
    setShowAvatarPicker(false);
  };

  const createProfile = async () => {
    const name = prompt("Nombre del nuevo perfil:");
    if (!name?.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('vivotv_profiles')
      .insert([{
        user_id: user.id,
        name: name.trim(),
        color: `color-${Math.floor(Math.random() * 4) + 1}`,
        is_kids: false
      }])
      .select()
      .single();

    if (data) {
      setProfiles(prev => [...prev, data]);
    }
  };

  const deleteProfile = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar este perfil?")) return;
    const { error } = await supabase.from('vivotv_profiles').delete().eq('id', id);
    if (!error) {
      setProfiles(prev => prev.filter(p => p.id !== id));
    }
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-[#0b122b]">
       <div className="w-16 h-16 border-8 border-[var(--primary)] border-t-transparent rounded-full animate-spin shadow-2xl" />
    </div>
  );

  return (
    <main className={`profile-selection h-screen flex items-center justify-center ${isEditing ? 'admin-mode' : ''}`}>
      
      <div className="profile-container w-full max-w-4xl px-4 text-center">
        <h1 className="text-4xl md:text-6xl font-black mb-4 uppercase">{isEditing ? 'Administrar Perfiles' : '¿Quién está viendo?'}</h1>
        <p className="subtitle text-gray-400 mb-12">
          {isEditing ? 'Haz clic en un perfil para editarlo.' : 'Selecciona un perfil para empezar a disfrutar.'}
        </p>
 
        <div className="profiles-grid flex flex-wrap justify-center gap-8">
          {profiles.map((profile) => (
            <div 
              key={profile.id} 
              className={`profile-item relative group w-32 md:w-44 text-center cursor-pointer ${isOccupied(profile) ? 'occupied' : ''}`}
              onClick={() => handleProfileClick(profile)}
            >
              <div className={`profile-avatar aspect-square rounded-2xl overflow-hidden border-4 border-transparent flex items-center justify-center transition-all bg-white/5 relative group-hover:border-white ${profile.avatar_url ? '' : profile.color}`}>
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-5xl font-bold">{profile.name[0]}</span>
                )}
                
                {profile.is_kids && <span className="kids-badge absolute top-2 right-2 bg-yellow-400 text-black px-2 py-1 rounded text-[10px] font-black uppercase">Niños</span>}
                {isOccupied(profile) && !isEditing && <div className="occupied-badge absolute bottom-2 bg-red-500 text-white px-2 py-0.5 rounded text-[10px] font-black uppercase">EN USO</div>}

                {/* Edit Overlay */}
                <div className="edit-overlay absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-4">
                   {isEditing ? (
                     <>
                        <Edit3 className="text-white w-8 h-8" />
                        <div className="flex gap-2">
                           <button 
                              onClick={(e) => { e.stopPropagation(); deleteProfile(profile.id); }}
                              className="p-2 bg-red-500 rounded-full hover:bg-red-600"
                           >
                             <Trash2 size={16} />
                           </button>
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setActiveProfile(profile);
                                setPinMode('create');
                                setShowPinPad(true);
                              }}
                              className="p-2 bg-blue-500 rounded-full hover:bg-blue-600"
                           >
                              {profile.pin ? <Unlock size={16} /> : <Lock size={16} />}
                           </button>
                        </div>
                     </>
                   ) : (
                      profile.pin && <Lock className="text-white/40 w-8 h-8" />
                   )}
                </div>
              </div>
              <input 
                type="text" 
                className="profile-name-input mt-4 bg-transparent border-none text-center text-xl font-bold text-gray-500 group-hover:text-white w-full outline-none" 
                defaultValue={profile.name}
                onBlur={(e) => isEditing && updateProfileName(profile.id, e.target.value)}
                readOnly={!isEditing}
                onClick={(e) => isEditing && e.stopPropagation()}
              />
            </div>
          ))}

          {profiles.length < 4 && isEditing && (
            <div className="profile-item w-32 md:w-44 text-center group cursor-pointer" onClick={createProfile}>
              <div className="profile-avatar aspect-square rounded-2xl border-2 border-dashed border-white/20 bg-white/5 flex items-center justify-center transition-all group-hover:border-white/40">
                <Plus size={48} className="text-white/20 group-hover:text-white/40" />
              </div>
              <span className="profile-name-input mt-4 block text-xl font-bold text-gray-600">Añadir</span>
            </div>
          )}
        </div>

        <div className="actions-container mt-16 flex justify-center gap-4">
           {isEditing ? (
             <button className="btn btn-primary" onClick={() => setIsEditing(false)}>
               Listo
             </button>
           ) : (
             <>
               <button className="btn btn-secondary border-white/20" onClick={() => setIsEditing(true)}>
                 Administrar Perfiles
               </button>
               <button 
                className="btn btn-secondary border-white/5 opacity-50 hover:opacity-100" 
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push('/login');
                }}
               >
                 Cerrar Sesión
               </button>
             </>
           )}
        </div>
      </div>

      {/* PIN PAD MODAL */}
      <div className={`pin-modal fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center transition-all ${showPinPad ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="pin-content bg-[#0b122b] border border-white/10 p-12 rounded-[40px] text-center max-w-sm w-full shadow-2xl">
          <h2 className="text-xl font-bold mb-8">
            {pinMode === 'locked' ? 'Introduce PIN' : 'Configura tu PIN'}
          </h2>
          <div className="pin-dots flex justify-center gap-4 mb-12">
            {[1,2,3,4].map(i => (
              <div key={i} className={`w-3 h-3 rounded-full border border-white/40 ${enteredPin.length >= i ? 'bg-white border-white scale-125' : ''}`} />
            ))}
          </div>
          <div className="pin-grid grid grid-cols-3 gap-6">
            {[1,2,3,4,5,6,7,8,9,0].map(n => (
              <div key={n} className={`w-16 h-16 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-3xl font-light cursor-pointer hover:bg-white/10 ${n === 0 ? 'col-start-2' : ''}`} onClick={() => handlePinPress(n.toString())}>{n}</div>
            ))}
            <div className="w-16 h-16 flex items-center justify-center text-sm text-gray-500 cursor-pointer hover:text-white" onClick={() => handlePinPress('back')}>⌫</div>
          </div>
          <button className="mt-8 text-gray-500 hover:text-white" onClick={() => setShowPinPad(false)}>Cancelar</button>
        </div>
      </div>

      {/* AVATAR PICKER MODAL */}
      <div className={`avatar-modal fixed inset-0 z-[11000] bg-black/90 backdrop-blur-xl flex items-center justify-center transition-all ${showAvatarPicker ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="avatar-selector-content p-8 max-w-2xl w-full text-center">
          <h2 className="text-3xl font-black mb-2 select-none uppercase italic">Elige tu avatar</h2>
          <p className="text-white/40 mb-12 select-none">Personaliza tu perfil con tu personaje favorito.</p>
          
          <div className="avatar-grid grid grid-cols-4 gap-6">
            {AVATAR_LIST.map(avatar => (
              <div 
                key={avatar.id} 
                className="avatar-option aspect-square rounded-xl overflow-hidden cursor-pointer border-4 border-transparent hover:border-white/40 transition-all hover:scale-110"
                onClick={() => updateAvatar(avatar.url)}
              >
                <img src={avatar.url} alt={avatar.name} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <button className="btn btn-secondary mt-12 w-full max-w-xs mx-auto" onClick={() => setShowAvatarPicker(false)}>Cancelar</button>
        </div>
      </div>

    </main>
  );
}
