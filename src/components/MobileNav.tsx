'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  const router = useRouter();
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});
  const [isDragging, setIsDragging] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [targetHref, setTargetHref] = useState<string | null>(null);

  const updateIndicator = (element: HTMLElement, dragging = false) => {
    const parent = navRef.current;
    if (!parent) return;

    const navRect = parent.getBoundingClientRect();
    const itemRect = element.getBoundingClientRect();
    
    const offsetLeft = itemRect.left - navRect.left;
    const itemWidth = itemRect.width;
    const indicatorWidth = 64; // Matching legacy CSS width

    setIndicatorStyle({
      left: `${offsetLeft + (itemWidth - indicatorWidth) / 2}px`,
      opacity: 1,
      transition: dragging ? 'none' : 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    });
  };

  const hideOn = ['/login', '/register', '/profiles'];

  useEffect(() => {
    const activeItem = navRef.current?.querySelector('.mobile-nav-item.active');
    if (activeItem) {
      updateIndicator(activeItem as HTMLElement);
    }
  }, [pathname]);

  if (hideOn.includes(pathname)) return null;

  const handleTouchMove = (e: React.TouchEvent) => {
    const nav = navRef.current;
    if (!nav) return;

    const touch = e.touches[0];
    const navRect = nav.getBoundingClientRect();
    
    // Clamp movement
    let x = touch.clientX - navRect.left;
    x = Math.max(0, Math.min(x, navRect.width));

    const items = Array.from(nav.querySelectorAll('.mobile-nav-item'));
    const colWidth = navRect.width / items.length;
    const index = Math.floor(x / colWidth);
    const closestItem = items[Math.min(index, items.length - 1)] as HTMLElement;

    if (closestItem) {
      const href = closestItem.getAttribute('href');
      setTargetHref(href);
      updateIndicator(closestItem, true);
      
      // Haptic Feedback
      if ('vibrate' in navigator && !isDragging) {
        navigator.vibrate(5);
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    handleTouchMove(e);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (targetHref && targetHref !== pathname) {
       router.push(targetHref);
    } else {
       // Reset to active
       const activeItem = navRef.current?.querySelector('.mobile-nav-item.active');
       if (activeItem) updateIndicator(activeItem as HTMLElement);
    }
  };

  return (
    <nav 
      className="mobile-nav" 
      ref={navRef} 
      style={{ display: 'flex' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div 
        className={`mobile-nav-indicator ${isDragging ? 'dragging' : ''}`} 
        style={indicatorStyle} 
        id="navIndicator" 
      />
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={(e) => {
              if (isDragging) e.preventDefault();
            }}
          >
            <Icon size={20} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
