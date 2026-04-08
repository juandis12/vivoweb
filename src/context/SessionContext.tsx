'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import Toast from '@/components/Toast';

interface Profile {
  id: string;
  name: string;
  avatar_url: string | null;
  color: string;
  is_kids: boolean;
  pin: string | null;
  last_heartbeat: string | null;
}

interface SessionContextType {
  currentProfile: Profile | null;
  setCurrentProfile: (profile: Profile | null) => void;
  logout: () => Promise<void>;
  isLoading: boolean;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [currentProfile, setCurrentProfileState] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  };

  // 1. Initial Load from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('vivotv_current_profile');
    if (stored) {
      try {
        setCurrentProfileState(JSON.parse(stored));
      } catch (e) {
        console.error('Error parsing profile session:', e);
      }
    }
    setIsLoading(false);
  }, []);

  // 2. Navigation Guard
  useEffect(() => {
    if (isLoading) return;

    const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
    const isProfilesPage = pathname === '/profiles';

    if (!currentProfile && !isAuthPage && !isProfilesPage) {
      router.push('/profiles');
    }
  }, [currentProfile, pathname, isLoading, router]);

  // 3. Heartbeat (10s)
  useEffect(() => {
    if (!currentProfile) return;

    const sendHeartbeat = async () => {
      try {
        await supabase.rpc('vivotv_heartbeat', { pid: currentProfile.id });
      } catch (e) {
        console.warn('Heartbeat error:', e);
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 10000);

    return () => clearInterval(interval);
  }, [currentProfile, supabase]);

  // 4. Concurrent Sessions (2 devices limit)
  useEffect(() => {
    const checkConcurrence = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let deviceId = localStorage.getItem('vivotv_device_id');
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('vivotv_device_id', deviceId);
      }

      await supabase.from('active_sessions').upsert({
        user_id: user.id,
        device_id: deviceId,
        last_seen: new Date().toISOString()
      });

      const twoMinAgo = new Date(Date.now() - 120000).toISOString();
      const { data: sessions } = await supabase
        .from('active_sessions')
        .select('*')
        .eq('user_id', user.id)
        .gt('last_seen', twoMinAgo)
        .order('last_seen', { ascending: false });

      if (sessions && sessions.length > 2) {
        const isAuthorized = sessions.slice(0, 2).some(s => s.device_id === deviceId);
        if (!isAuthorized) {
          showToast('Límite de 2 dispositivos alcanzado. Cerrando sesión.', 'error');
          setTimeout(() => logout(), 2000);
        }
      }
    };

    if (currentProfile) {
      checkConcurrence();
      const interval = setInterval(checkConcurrence, 60000);
      return () => clearInterval(interval);
    }
  }, [currentProfile, supabase]);

  // 5. Realtime Expulsion
  useEffect(() => {
    if (!currentProfile) return;

    const channel = supabase
      .channel(`session-${currentProfile.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'vivotv_profiles',
        filter: `id=eq.${currentProfile.id}`
      }, (payload: any) => {
        if (payload.new.last_heartbeat === null) {
          showToast('Tu sesión ha sido finalizada desde otro dispositivo.', 'info');
          sessionStorage.removeItem('vivotv_current_profile');
          setCurrentProfileState(null);
          router.push('/profiles');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentProfile, supabase, router]);

  const setCurrentProfile = (profile: Profile | null) => {
    if (profile) {
      sessionStorage.setItem('vivotv_current_profile', JSON.stringify(profile));
    } else {
      sessionStorage.removeItem('vivotv_current_profile');
    }
    setCurrentProfileState(profile);
  };

  const logout = async () => {
    if (currentProfile) {
      await supabase.rpc('vivotv_release_session', { pid: currentProfile.id });
    }
    sessionStorage.removeItem('vivotv_current_profile');
    setCurrentProfileState(null);
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <SessionContext.Provider value={{ currentProfile, setCurrentProfile, logout, isLoading, showToast }}>
      {children}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
