'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Home, Film, Tv, List, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Autofocus al abrir el buscador
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isSearchOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
    }
  };

  return (
    <>
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled || isSearchOpen ? 'bg-base/95 backdrop-blur-md border-b border-white/10' : 'bg-transparent'}`}>
        <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto gap-4">
          
          {/* Logo y Nav (Se oculta si el buscador est├í abierto en móvil) */}
          {!isSearchOpen && (
             <div className="flex items-center gap-8 animate-in fade-in duration-300">
               <Link href="/" className="text-2xl font-black tracking-tight text-white shrink-0">
                 VIVO<span className="text-primary">TV</span>
               </Link>

               <nav className="hidden md:flex gap-6 items-center">
                 <NavLink href="/" currentPath={pathname}>Inicio</NavLink>
                 <NavLink href="/peliculas" currentPath={pathname}>Películas</NavLink>
                 <NavLink href="/series" currentPath={pathname}>Series</NavLink>
                 <NavLink href="/anime" currentPath={pathname}>Anime</NavLink>
                 <NavLink href="/milista" currentPath={pathname}>Mi Lista</NavLink>
                 <NavLink href="/historial" currentPath={pathname}>Historial</NavLink>
               </nav>
             </div>
          )}

          {/* Buscador Expandible */}
          <div className={`flex-1 flex justify-end items-center ${isSearchOpen ? 'w-full' : 'w-auto'}`}>
            {isSearchOpen ? (
              <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2 animate-in slide-in-from-right-4 duration-300">
                <Search className="w-5 h-5 text-primary shrink-0" />
                <input 
                  ref={searchInputRef}
                  type="text"
                  placeholder="Buscar películas, series..."
                  className="w-full bg-transparent border-none outline-none text-white text-lg font-medium placeholder:text-white/30"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="button" onClick={() => setIsSearchOpen(false)} className="text-white/50 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-4">
                 <button 
                  onClick={() => setIsSearchOpen(true)}
                  className="text-white/70 hover:text-white transition-colors p-2 rounded-full hover:bg-white/5"
                >
                  <Search className="w-5 h-5" />
                </button>
                <Link href="/profiles" className="flex items-center gap-2 cursor-pointer bg-surface py-1.5 px-3 rounded-full border border-white/10 hover:border-white/20 transition-all">
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold">
                    U
                  </div>
                </Link>
              </div>
            )}
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
