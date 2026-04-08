'use client';

import { useEffect, useState } from 'react';

export default function SplashScreen() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 2200); // Match legacy timing (2.2s delay before fade)

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="splash-screen">
      <div className="splash-logo">
        VIVO<span>TV</span>
      </div>
      <div className="splash-bars">
        <div style={{ animationDelay: '0s' }}></div>
        <div style={{ animationDelay: '0.1s' }}></div>
        <div style={{ animationDelay: '0.2s' }}></div>
        <div style={{ animationDelay: '0.3s' }}></div>
        <div style={{ animationDelay: '0.4s' }}></div>
      </div>
    </div>
  );
}
