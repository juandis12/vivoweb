'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MeshBackground from '@/components/MeshBackground';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: username,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
    } else {
      router.push('/profiles');
    }
  };

  return (
    <main className="auth-container relative min-h-screen flex items-center justify-center">
      <MeshBackground />
      
      <div className="auth-card glass-panel w-full max-w-[440px] p-12 rounded-[40px] relative z-10 text-center">
        <div className="auth-logo mb-8">
          <Link href="/" className="text-3xl font-black italic tracking-tighter">
            VIVO<span>TV</span>
          </Link>
        </div>
        
        <h2 className="text-3xl font-black mb-2 uppercase italic">Crea tu cuenta gratuita</h2>
        <p className="text-white/40 font-bold uppercase tracking-widest text-[10px] mb-8">Únete a la mejor experiencia de streaming premium</p>

        <form onSubmit={handleRegister} className="text-left space-y-6">
          <div className="input-group">
            <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-2">Nombre de Usuario</label>
            <input 
              type="text" 
              required 
              placeholder="Tu nombre artístico"
              className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white outline-none focus:border-[var(--primary)] transition-all"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-2">Correo Electrónico</label>
            <input 
              type="email" 
              required 
              placeholder="tu@correo.com"
              className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white outline-none focus:border-[var(--primary)] transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-2">Contraseña</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                required 
                placeholder="••••••••"
                className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white outline-none focus:border-[var(--primary)] transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button 
                type="button" 
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="btn btn-primary w-full py-4 text-lg"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'REGISTRARME'}
          </button>
        </form>

        <div className="my-8 flex items-center gap-4 text-white/10">
          <div className="h-px bg-current flex-1" />
          <span className="text-[10px] font-black uppercase tracking-widest">o continúa con</span>
          <div className="h-px bg-current flex-1" />
        </div>

        <p className="text-white/40 text-sm font-bold">
          ¿Ya tienes cuenta? <Link href="/login" className="text-white hover:underline ml-1">Inicia sesión</Link>
        </p>
      </div>
    </main>
  );
}
