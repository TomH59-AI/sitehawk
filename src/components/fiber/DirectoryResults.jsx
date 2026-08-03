import { Building2, Landmark, MapPin, RadioTower } from "lucide-react";
import DirectoryContactCard from "./DirectoryContactCard";
import DirectoryAuthorities from "./DirectoryAuthorities";

export default function DirectoryResults({ result }) {
  const place = [result.location?.city, result.location?.county, result.location?.state].filter(Boolean).join(", ");
  return (
    <section className="mt-8">
      <div className="overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-lg shadow-primary/5">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between md:p-7">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Market dossier</p>
            <h2 className="mt-1 font-heading text-3xl font-bold text-foreground">Results for {result.zip}</h2>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4 text-primary" />{place || "Location name unavailable"}</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/60 px-4 py-3 text-xs text-muted-foreground">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-foreground">Geographic source</span>
            {result.location?.source}
          </div>
        </div>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:h-fit">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Dossier chapters</p>
          <nav className="space-y-2">
            <a href="#jurisdictions" className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-sm font-semibold text-foreground hover:border-primary/30"><Landmark className="h-4 w-4 text-primary" /> Authorities</a>
            <a href="#public-safety" className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-sm font-semibold text-foreground hover:border-primary/30"><Building2 className="h-4 w-4 text-primary" /> Public safety</a>
            <a href="#infrastructure" className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-sm font-semibold text-foreground hover:border-primary/30"><RadioTower className="h-4 w-4 text-primary" /> Infrastructure</a>
          </nav>
        </aside>
        <div className="min-w-0">
          <DirectoryAuthorities authorities={result.authorities} notice={result.notices?.authorities} />
          <section id="infrastructure" className="mt-8 scroll-mt-24 space-y-8">
            <div>
              <div className="mb-3 flex items-center gap-3"><span className="font-heading text-sm font-bold text-primary">03</span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Infrastructure chapter</p><h2 className="font-heading text-xl font-bold text-foreground">Local electric utility</h2></div></div>
              {result.utility ? <DirectoryContactCard item={result.utility} kind="Electric utility" /> : <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{result.notices?.utility}</p>}
            </div>
            <div>
              <h2 className="mb-3 font-heading text-xl font-bold text-foreground">Fiber and backhaul contacts</h2>
              {result.fiber?.length ? <div className="space-y-3">{result.fiber.map((item) => <DirectoryContactCard key={item.id} item={item} kind="Fiber operator" />)}</div> : <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{result.notices?.fiber}</p>}
              {result.fiber?.length > 0 && <p className="mt-3 rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">{result.notices?.fiber}</p>}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}