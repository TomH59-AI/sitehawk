import { FileText, ExternalLink, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function DocGroup({ title, items }) {
  return (
    <div>
      <div className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground mb-2">{title}</div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data available (Oxylabs Web Scraper API).</p>
      ) : (
        <div className="space-y-2">
          {items.map((d, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">{d.title}</span>
                {d.pdf && <Badge variant="outline" className="text-[10px] shrink-0">PDF</Badge>}
              </div>
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => window.open(d.url, "_blank")}>
                Open <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Oxylabs-sourced Building Permit + Zoning Permit applications for the typed
 * jurisdiction. Links are shown exactly as returned — nothing is inferred.
 */
export default function HawkPermitDocs({ loading, data, error, onUploadCta }) {
  if (loading) {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
        <span className="text-sm font-medium text-primary">Retrieving building &amp; zoning permit applications…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="mt-5 rounded-lg border border-border p-4 space-y-5">
      <DocGroup title="BUILDING PERMIT APPLICATION" items={data.building || []} />
      <DocGroup title="ZONING PERMIT APPLICATION" items={data.zoning || []} />
      <DocGroup title="OFFICIAL ZONING MAP" items={data.zoning_map || []} />
      <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
        Source: {data.source}. Download the application, then upload it below — Hawk Document Intelligence will help fill it out.
      </p>
      <Button onClick={onUploadCta} variant="secondary" className="w-full gap-2 font-heading font-semibold">
        <Upload className="w-4 h-4" /> Upload to Hawk Document Intelligence
      </Button>
    </div>
  );
}