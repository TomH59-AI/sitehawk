import { MapPin, Trash2, Zap } from "lucide-react";

const verdictBg = (decision) => {
  if (decision === "APPROVED") return "bg-green-100 text-green-800";
  if (decision === "REJECTED") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
};

/**
 * TalonFitSavedSites — sidebar showing up to 3 saved TalonFIT™ sites.
 * Each site displays the GREEN/RED verdict, lat/lon, max buildable height,
 * binding constraint, and ordinance citation.
 */
export default function TalonFitSavedSites({ sites, onRemove }) {
  const MAX = 3;
  const LETTERS = ["D", "E", "F"];

  return (
    <div className="flex h-full flex-col p-3">
      <div className="pb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <Zap className="h-3.5 w-3.5 text-primary" /> TalonFIT™ Saved Sites
      </div>

      {sites.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No sites saved yet. Click a point on the map to probe it, then double-click to save.
          Up to {MAX} sites can be saved per session.
        </p>
      ) : (
        <div className="space-y-2">
          {sites.map((s, i) => (
            <div key={i} className="rounded-lg border border-border bg-muted/40 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary" /> Site {LETTERS[i]}
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Remove site"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {s.decision && (
                <div className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${verdictBg(s.decision)}`}>
                  {s.decision}
                  {Number.isFinite(s.maxHeight) ? ` · max ${s.maxHeight} ft` : ""}
                </div>
              )}

              <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                {Number(s.latitude).toFixed(6)}, {Number(s.longitude).toFixed(6)}
              </div>

              {s.bindingConstraint && (
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  Binding: {s.bindingConstraint}
                </div>
              )}
              {s.ordinanceSection && (
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  Cite: {s.ordinanceSection}
                  {s.ordinanceVerified ? " (verified)" : " (unverified)"}
                </div>
              )}
              {s.address && (
                <div className="mt-0.5 text-[11px] text-foreground">{s.address}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto pt-2 text-[10px] text-muted-foreground">
        {sites.length}/{MAX} sites saved
      </div>
    </div>
  );
}