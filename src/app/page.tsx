import { createClient } from '@/utils/supabase/server';

export default async function HomePage() {
  const supabase = createClient();
  
  // Próximamente: Obtener ids del catálogo desde el Edge RPC
  // const { data } = await supabase.rpc('get_catalog_ids');

  return (
    <main className="pt-24 px-6 max-w-7xl mx-auto">
      {/* Hero Skeleton (Se reemplazará) */}
      <section className="w-full aspect-video md:aspect-[21/9] bg-surface rounded-3xl border border-white/5 flex items-center justify-center relative overflow-hidden mb-12">
        <div className="absolute inset-0 bg-gradient-to-t from-base to-transparent z-10" />
        <h1 className="z-20 text-4xl md:text-6xl font-black tracking-tighter mix-blend-overlay">CATÁLOGO VIVO</h1>
      </section>

      {/* Grid Placeholder */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
          <div key={i} className="aspect-[2/3] bg-surface rounded-xl border border-white/5 animate-pulse" />
        ))}
      </div>
    </main>
  );
}
