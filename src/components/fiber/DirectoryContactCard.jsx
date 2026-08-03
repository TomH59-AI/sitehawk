import { ExternalLink, Mail, Phone } from "lucide-react";

export default function DirectoryContactCard({ item, kind }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{kind}</p>
          <h3 className="font-heading text-base font-bold text-foreground">{item.name}</h3>
          {item.type && <p className="text-xs text-muted-foreground">{String(item.type).replaceAll("_", " ")}</p>}
        </div>
        {item.contact_name && <span className="text-xs text-muted-foreground">Contact: {item.contact_name}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {item.phone ? <a href={`tel:${item.phone}`} className="inline-flex items-center gap-1 text-primary"><Phone className="h-4 w-4" />{item.phone}</a> : <span className="text-muted-foreground">Phone: No data available</span>}
        {item.email && <a href={`mailto:${item.email}`} className="inline-flex items-center gap-1 text-primary"><Mail className="h-4 w-4" />{item.email}</a>}
        {item.website ? <a href={item.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">Website <ExternalLink className="h-3.5 w-3.5" /></a> : <span className="text-muted-foreground">Website: No data available</span>}
      </div>
      {item.address && <p className="mt-2 text-xs text-muted-foreground">{item.address}</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">Source: {item.source}{item.data_year ? ` (${item.data_year})` : ""}</p>
    </article>
  );
}