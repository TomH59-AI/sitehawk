import { ExternalLink, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

export default function DirectoryContactCard({ item, kind }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-colors hover:border-primary/30">
      <div className="h-1 bg-gradient-to-r from-primary via-accent to-transparent" />
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{kind}</p>
            <h3 className="mt-1 font-heading text-lg font-bold text-foreground">{item.name}</h3>
            {item.type && <p className="mt-0.5 text-xs capitalize text-muted-foreground">{String(item.type).replaceAll("_", " ")}</p>}
          </div>
          {item.contact_name && <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground">Contact: {item.contact_name}</span>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {item.phone ? <a href={`tel:${item.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 font-semibold text-primary"><Phone className="h-4 w-4" />{item.phone}</a> : <span className="rounded-lg bg-secondary px-3 py-2 text-muted-foreground">Phone: No data available</span>}
          {item.email && <a href={`mailto:${item.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 font-semibold text-primary"><Mail className="h-4 w-4" />{item.email}</a>}
          {item.website ? <a href={item.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-semibold text-foreground">Website <ExternalLink className="h-3.5 w-3.5" /></a> : <span className="rounded-lg border border-border px-3 py-2 text-muted-foreground">Website: No data available</span>}
        </div>
        {item.address && <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item.address}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/40 px-5 py-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Source: {item.source}{item.data_year ? ` (${item.data_year})` : ""}</span>
        {item.official_source_url && <a href={item.official_source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary">Official source <ExternalLink className="h-3 w-3" /></a>}
      </div>
    </article>
  );
}