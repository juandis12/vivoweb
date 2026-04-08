import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/Navigation';
import MobileNav from '@/components/MobileNav';
import SplashScreen from '@/components/SplashScreen';

export const metadata: Metadata = {
  title: 'VIVOTV | Streaming Premium',
  description: 'Siente la velocidad del mejor contenido en alta definición.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased min-h-screen">
        <SplashScreen />
        <Navigation />
        {children}
        <MobileNav />
      </body>
    </html>
  );
}
