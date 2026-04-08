'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useSession } from '@/context/SessionContext';
import ExitModal from './ExitModal';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const { currentProfile } = useSession();
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const supabase = createClient();

  const hideOn = ['/login', '/register', '/profiles'];

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (hideOn.includes(pathname)) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const navItems = [
    { href: '/', label: 'Inicio' },
    { href: '/peliculas', label: 'Películas' },
    { href: '/series', label: 'Series' },
    { href: '/anime', label: 'Anime' },
    { href: '/milista', label: 'Mi Lista' },
  ];

  return (
    <>
      <header className={`navbar ${isScrolled ? 'scrolled' : ''}`} id="navbar">
        <div className="logo cursor-pointer" onClick={() => router.push('/')}>
          VIVO<span>TV</span>
        </div>

        <nav id="mainNav">
          {navItems.map((item) => (
            <Link 
              key={item.href} 
              href={item.href}
              className={pathname === item.href ? 'active' : ''}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="user-actions">
          <div className={`search-box ${isSearchActive || searchQuery || pathname === '/search' ? 'active' : ''}`} id="searchBox">
            <Search 
              size={18} 
              className="text-white/40 cursor-pointer hover:text-white" 
              onClick={() => setIsSearchActive(true)}
            />
            <form onSubmit={handleSearch}>
              <input 
                type="text" 
                placeholder="Buscar títulos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchActive(true)}
                onBlur={() => !searchQuery && setIsSearchActive(false)}
              />
            </form>
          </div>

          <div 
            className="user-profile-btn flex items-center gap-3 cursor-pointer group"
            onClick={() => setIsExitModalOpen(true)}
          >
            <div 
              className={`avatar ${currentProfile?.avatar_url ? '' : (currentProfile?.color || 'color-1')}`}
              style={currentProfile?.avatar_url ? { backgroundImage: `url(${currentProfile.avatar_url})`, backgroundSize: 'cover' } : {}}
            >
              {!currentProfile?.avatar_url && (currentProfile?.name?.[0].toUpperCase() || 'U')}
            </div>
            <span className="hidden md:inline text-sm font-medium text-white/80 group-hover:text-white transition-colors">
              {currentProfile?.name || 'Usuario'}
            </span>
          </div>
        </div>
      </header>

      <ExitModal 
        isOpen={isExitModalOpen} 
        onClose={() => setIsExitModalOpen(false)} 
      />
    </>
  );
}
