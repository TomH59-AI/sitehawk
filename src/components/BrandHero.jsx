export default function BrandHero() {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4 shadow-lg shadow-primary/30">
        <span className="text-3xl">🦅</span>
      </div>
      <h1 className="font-heading font-bold text-4xl text-foreground tracking-tight">SiteHawk</h1>
      <p className="text-base text-muted-foreground mt-1 italic">When you need the AI vision</p>
      <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20">
        <span className="text-[10px] uppercase tracking-[0.15em] text-primary font-bold">A SkyWave AI Product</span>
      </div>
      <p className="text-xs text-muted-foreground/50 mt-3 tracking-widest uppercase">Powered by SkyWave AI</p>
    </div>
  );
}