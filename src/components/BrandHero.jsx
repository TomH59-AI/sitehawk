export default function BrandHero() {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4 shadow-lg shadow-primary/30">
        <span className="text-3xl">🦅</span>
      </div>
      <h1 className="font-heading font-bold text-4xl text-foreground tracking-tight">SiteHawk</h1>
      <p className="text-base text-muted-foreground mt-1 italic">When you need the AI vision</p>
      <p className="text-xs text-muted-foreground/60 mt-3 tracking-widest uppercase">Powered by SkyWave AI</p>
    </div>
  );
}