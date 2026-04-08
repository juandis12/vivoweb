'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, ReactNode } from 'react';

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayChildren, setDisplayChildren] = useState(children);

  useEffect(() => {
    if (pathname !== undefined) {
      setIsTransitioning(true);
      
      // Meticulous 75ms delay as in legacy code for cinematic feel
      const timeout = setTimeout(() => {
        setDisplayChildren(children);
        setIsTransitioning(false);
      }, 150); // Increased slightly for React hydration smoothness

      return () => clearTimeout(timeout);
    }
  }, [pathname, children]);

  return (
    <>
      <div 
        className={`page-transition-overlay fixed inset-0 z-[10000] bg-[#0b122b] pointer-events-none transition-opacity duration-300 ${isTransitioning ? 'opacity-100' : 'opacity-0'}`} 
      />
      <div className={`transition-all duration-500 ${isTransitioning ? 'scale-[0.98] blur-sm opacity-50' : 'scale-100 blur-0 opacity-100'}`}>
        {displayChildren}
      </div>
    </>
  );
}
