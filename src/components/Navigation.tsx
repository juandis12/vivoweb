'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  Film, 
  Tv, 
  Zap, 
  Heart, 
  History, 
  Search, 
  User,
  Settings
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/', icon: Home, label: 'Inicio' },
  { href: '/peliculas', icon: Film, label: 'Pel├¡culas' },
  { href: '/series', icon: Tv, label: 'Series' },
  { href: '/anime', icon: Zap, label: 'Anime' },
  { href: '/milista', icon: Heart, label: 'Mi Lista' },
  { href: '/historial', icon: History, label: 'Historial' },
];

export default function Navigation() {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      {/* DESKTOP SIDEBAR (Apple TV Style) */}
      <aside 
        className={`fixed left-0 top-0 h-screen glass border-r bg-black/40 z-[100] hidden md:flex flex-col items-center py-10 transition-all duration-500 ease-in-out ${isExpanded ? 'w-64' : 'w-20'}`}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <div className={`mb-12 flex items-center gap-3 ${isExpanded ? 'px-6' : 'justify-center'}`}>
           <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-[0_0_15px_var(--primary-glow)]">
             <span className="text-xl font-black italic">V</span>
           </div>
           {isExpanded && <span className="text-xl font-black tracking-tighter animate-fade">VIVOTV</span>}
        </div>

        <nav className="flex-1 w-full space-y-4 px-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-4 py-3 rounded-2xl transition-all duration-300 relative ${isActive ? 'bg-primary/10 text-primary shadow-[0_0_20px_rgba(99,102,241,0.1)]' : 'text-white/40 hover:bg-white/5 hover:text-white'} ${isExpanded ? 'px-4' : 'justify-center'}`}
              >
                <item.icon className={`w-6 h-6 transition-transform group-hover:scale-110 ${isActive ? 'stroke-[2.5px]' : ''}`} />
                {isExpanded && <span className="font-bold tracking-tight animate-fade overflow-hidden whitespace-nowrap">{item.label}</span>}
                {isActive && !isExpanded && <div className="absolute right-0 w-1 h-6 bg-primary rounded-l-full shadow-[0_0_10px_var(--primary-glow)]" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto w-full px-3 space-y-4">
           <Link href="/profiles" className={`flex items-center gap-4 py-3 text-white/40 hover:text-white rounded-2xl transition-all ${isExpanded ? 'px-4' : 'justify-center'}`}>
              <User className="w-6 h-6" />
              {isExpanded && <span className="font-bold animate-fade">Perfiles</span>}
           </Link>
        </div>
      </aside>

      {/* MOBILE BOTTOM TAB BAR (Netflix Mobile Style) */}
      <nav className="fixed bottom-0 left-0 right-0 h-20 glass bg-black/80 z-[100] border-t md:hidden flex items-center justify-around px-2 pb-2">
        {navItems.slice(0, 4).map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl transition-all ${isActive ? 'text-primary' : 'text-white/40'}`}
            >
              <item.icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5px]' : ''}`} />
              <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
              {isActive && <div className="w-1 h-1 bg-primary rounded-full shadow-[0_0_10px_var(--primary)]" />}
            </Link>
          );
        })}
        <Link href="/profiles" className="flex flex-col items-center gap-1.5 px-3 py-2 text-white/40">
           <User className="w-6 h-6" />
           <span className="text-[10px] font-black uppercase tracking-widest">Cuenta</span>
        </Link>
      </nav>
    </>
  );
}
