'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Film, Tv, Bookmark, Search } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

const navItems = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/peliculas', label: 'Cine', icon: Film },
  { href: '/series', label: 'Series', icon: Tv },
  { href: '/milista', label: 'Lista', icon: Bookmark },
  { href: '/search', label: 'Buscar', icon: Search },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [indicatorStyle, setIndicatorStyle] = useState({});
  const navRef = useRef<HTMLElement>(null);

  // We only show MobileNav if we are NOT in auth pages or profile selection
  const hideOn = ['/login', '/register', '/profiles'];
  if (hideOn.includes(pathname)) return null;

  useEffect(() => {
    const activeItem = navRef.current?.querySelector('.active');
    if (activeItem) {
      const { offsetLeft, offsetWidth } = activeItem as HTMLElement;
      setIndicatorStyle({
        left: `${offsetLeft}px`,
        width: `${offsetWidth}px`,
      });
    }
  }, [pathname]);

  return (
    <nav className="mobile-nav" ref={navRef} style={{ display: 'flex' }}>
      <div className="mobile-nav-indicator" style={indicatorStyle} id="navIndicator" />
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
