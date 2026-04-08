'use client';

import { createClient } from '@/utils/supabase/client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Mail, Lock, UserPlus, CheckCircle } from 'lucide-react';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: { user }, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name }
      }
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
      setTimeout(() => router.push('/login'), 3000);
    }
  };

  if (success) return (
     <main className="min-h-screen flex items-center justify-center bg-base px-6">
        <div className="text-center space-y-6 animate-fade">
           <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center mx-auto border-4 border-primary shadow-[0_0_50px_var(--primary-glow)]">
              <CheckCircle className="w-12 h-12 text-primary" />
           </div>
           <h2 className="text-4xl font-black uppercase tracking-tighter">┬íCuenta Creada!</h2>
           <p className="text-white/40 font-medium">Revisa tu correo para verificar tu cuenta. Redirigiendo...</p>
        </div>
     </main>
  );

  return (
    <main className="min-h-screen flex items-center justify-center bg-base px-6 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 blur-[150px] rounded-full -z-10" />

      <div className="w-full max-w-lg animate-fade">
        <div className="text-center mb-12">
           <h1 className="text-5xl font-black tracking-tighter uppercase mb-2 italic">VIVOTV</h1>
           <p className="text-white/40 font-medium">Crea tu cuenta gratuita y empieza a disfrutar hoy mismo.</p>
        </div>

        <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6 bg-white/5 border border-white/10 p-8 md:p-12 rounded-[2rem] glass shadow-2xl relative shadow-primary/5">
          <div className="md:col-span-2 space-y-2">
             <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-4">Nombre Completo</label>
             <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-primary transition-colors" />
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu Nombre"
                  className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-primary/50 focus:bg-black/60 transition-all font-medium"
                  required
                />
             </div>
          </div>

          <div className="md:col-span-2 space-y-2">
             <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-4">Email</label>
             <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-primary transition-colors" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-primary/50 focus:bg-black/60 transition-all font-medium"
                  required
                />
             </div>
          </div>

          <div className="md:col-span-2 space-y-2">
             <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-4">Clave Segura</label>
             <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-primary transition-colors" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 caracteres"
                  className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-primary/50 focus:bg-black/60 transition-all font-medium"
                  required
                />
             </div>
          </div>

          {error && <p className="md:col-span-2 text-red-400 text-sm font-bold text-center bg-red-400/5 py-4 rounded-xl border border-red-400/10 mb-4">{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="md:col-span-2 w-full bg-white text-base py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-white/90 hover:scale-[1.01] active:scale-[0.99] transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-3 mt-4"
          >
            {loading ? <div className="w-6 h-6 border-2 border-base border-t-transparent rounded-full animate-spin" /> : <>Registrarme <UserPlus className="w-5 h-5" /></>}
          </button>

          <p className="md:col-span-2 text-center text-white/20 text-xs font-bold uppercase tracking-widest pt-6 border-t border-white/5">
             Al unirte aceptas los <span className="underline cursor-pointer">T├⌐rminos de Servicio</span>
          </p>
        </form>

        <p className="mt-8 text-center text-white/40 font-medium">
          ┬┐Ya eres miembro? <Link href="/login" className="text-white hover:text-primary font-black uppercase tracking-tighter ml-2 underline transition-colors">Entra aqu├¡</Link>
        </p>
      </div>
    </main>
  );
}
