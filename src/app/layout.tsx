import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'VivoWeb - Streaming Next.js',
  description: 'Catálogo de Películas y Series de alta velocidad.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased min-h-screen pb-24">
        <Navigation />
        {children}
      </body>
    </html>
  );
}
