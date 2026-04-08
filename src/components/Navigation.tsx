'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Home, Film, Tv, List, User } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Navigation() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-base/90 backdrop-blur-md border-b border-white/10' : 'bg-transparent'}`}>
        <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          {/* Logo */}
          <Link href="/" className="text-2xl font-black tracking-tight text-white">
            VIVO<span className="text-primary">TV</span>
          </Link>

          {/* Nav Links (Desktop) */}
          <nav className="hidden md:flex gap-6 items-center">
            <NavLink href="/" currentPath={pathname}>Inicio</NavLink>
            <NavLink href="/peliculas" currentPath={pathname}>Películas</NavLink>
            <NavLink href="/series" currentPath={pathname}>Series</NavLink>
            <NavLink href="/anime" currentPath={pathname}>Anime</NavLink>
            <NavLink href="/milista" currentPath={pathname}>Mi Lista</NavLink>
          </nav>

          {/* User Actions */}
          <div className="flex items-center gap-4">
            <button className="text-white/70 hover:text-white transition-colors">
              <Search className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 cursor-pointer bg-surface py-1.5 px-3 rounded-full border border-white/10 hover:border-white/20 transition-all">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs font-bold">
                U
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Nav (Bottom Bar) */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 z-50 glass-panel rounded-2xl flex justify-around p-3 items-center">
        <MobileNavLink href="/" icon={Home} label="Inicio" currentPath={pathname} />
        <MobileNavLink href="/peliculas" icon={Film} label="Cine" currentPath={pathname} />
        <MobileNavLink href="/series" icon={Tv} label="Series" currentPath={pathname} />
        <MobileNavLink href="/milista" icon={List} label="Lista" currentPath={pathname} />
      </nav>
    </>
  );
}

function NavLink({ href, children, currentPath }: { href: string; children: React.ReactNode; currentPath: string }) {
  const isActive = currentPath === href;
  return (
    <Link 
      href={href} 
      className={`text-sm font-medium transition-colors ${isActive ? 'text-white' : 'text-white/60 hover:text-white'}`}
    >
      {children}
    </Link>
  );
}

function MobileNavLink({ href, icon: Icon, label, currentPath }: any) {
  const isActive = currentPath === href;
  return (
    <Link href={href} className="flex flex-col items-center gap-1 w-16">
      <Icon className={`w-6 h-6 transition-all ${isActive ? 'text-primary scale-110' : 'text-white/50'}`} />
      <span className={`text-[10px] uppercase font-bold tracking-wider ${isActive ? 'text-primary' : 'text-white/50'}`}>{label}</span>
    </Link>
  );
}
