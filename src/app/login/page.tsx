'use client';

import { createClient } from '@/utils/supabase/client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, LogIn, Github, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/profiles');
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-base px-6 relative overflow-hidden">
      
      {/* Background Neon Glows */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/20 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-accent/20 blur-[120px] rounded-full animate-pulse delay-700" />

      <div className="w-full max-w-md animate-fade">
        <div className="text-center mb-12">
           <div className="w-16 h-16 bg-primary rounded-2xl mx-auto flex items-center justify-center shadow-[0_0_30px_var(--primary-glow)] mb-6 rotate-12 transition-transform hover:rotate-0 cursor-pointer">
              <span className="text-3xl font-black italic">V</span>
           </div>
           <h1 className="text-4xl font-black tracking-tighter uppercase mb-2">Bienvenido de nuevo</h1>
           <p className="text-white/40 font-medium">Entra a tu cuenta para seguir disfrutando de <span className="text-white">VIVOTV</span></p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
             <label className="text-xs font-black uppercase tracking-widest text-white/30 ml-4">Email</label>
             <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-primary transition-colors" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-medium"
                  required
                />
             </div>
          </div>

          <div className="space-y-2">
             <label className="text-xs font-black uppercase tracking-widest text-white/30 ml-4">Contrase├▒a</label>
             <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-primary transition-colors" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="ÔÇóÔÇóÔÇóÔÇóÔÇóÔÇó"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-primary focus:bg-white/10 transition-all font-medium"
                  required
                />
             </div>
          </div>

          {error && <p className="text-red-400 text-sm font-bold text-center bg-red-400/10 py-3 rounded-xl border border-red-400/20">{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-primary py-4 rounded-2xl font-black uppercase tracking-widest hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3"
          >
            {loading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <>Ingresar <LogIn className="w-5 h-5" /></>}
          </button>
        </form>

        <div className="mt-10 pt-10 border-t border-white/5 space-y-6">
           <button className="w-full py-4 glass border-white/10 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-white/5 transition-all">
              <Github className="w-5 h-5" /> Continuar con Github
           </button>
           
           <p className="text-center text-white/40 font-medium">
             ┬┐No tienes cuenta? <Link href="/register" className="text-primary hover:underline font-black uppercase tracking-tighter ml-2">Reg├¡strate ahora</Link>
           </p>
        </div>
      </div>
    </main>
  );
}
