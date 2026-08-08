import { ExternalLink, FileText } from "lucide-react";

/**
 * Government Forms card — links straight to the agency's own form or portal.
 * Nothing is generated, altered, or pre-filled here.
 */
export default function GovFormCard({ item }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileText className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-heading font-bold text-sm text-foreground">{item.name}</span>
            {item.tag && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                {item.tag}
              </span>
            )}
            {item.fillable && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                Fillable
              </span>
            )}
          </div>
          {item.subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
          )}
          {item.purpose && (
            <p className="text-xs leading-relaxed text-muted-foreground mt-2">{item.purpose}</p>
          )}
        </div>
        <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </a>
  );
}