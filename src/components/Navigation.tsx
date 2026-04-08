'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Bell, User, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const supabase = createClient();

  // Hide Navbar in auth/profiles pages
  const hideOn = ['/login', '/register', '/profiles'];
  if (hideOn.includes(pathname)) return null;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    
    // Load current profile from localStorage
    const stored = localStorage.getItem('vivotv_current_profile');
    if (stored) {
      setUserProfile(JSON.parse(stored));
    }

    return () => window.removeEventListener('scroll', handleScroll);
  }, [pathname]);

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
          <input 
            type="text" 
            placeholder="Buscar títulos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchActive(true)}
            onBlur={() => !searchQuery && setIsSearchActive(false)}
          />
          {searchQuery && (
            <X 
              size={18} 
              className="text-white/40 cursor-pointer hover:text-white" 
              onClick={() => setSearchQuery('')}
            />
          )}
        </div>

        <div 
          id="userProfile" 
          className="user-profile-btn cursor-pointer"
          onClick={() => router.push('/profiles')}
        >
          <div 
            className={`avatar ${userProfile?.avatar_url ? '' : (userProfile?.color || 'color-1')}`}
            style={userProfile?.avatar_url ? { backgroundImage: `url(${userProfile.avatar_url})`, backgroundSize: 'cover' } : {}}
          >
            {!userProfile?.avatar_url && (userProfile?.name?.[0] || 'U')}
          </div>
          <span id="userName">{userProfile?.name || 'Usuario'}</span>
        </div>
      </div>
    </header>
  );
}
