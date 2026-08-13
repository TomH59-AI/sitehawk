import { MapPin, Trash2 } from "lucide-react";

/**
 * SavedScoutTargets — the up-to-three extra targets (D/E/F) the user saved
 * from the scout map, shown beside the map.
 */
export default function SavedScoutTargets({ saved, onRemove }) {
  return (
    <div className="flex h-full flex-col p-3">
      <div className="pb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Saved Extra Targets
      </div>
      {saved.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          None saved yet. Click a point on the map, review the popup, and hit Save — up to three.
        </p>
      ) : (
        <div className="space-y-2">
          {saved.map((s, i) => (
            <div key={s.id} className="rounded-lg border border-border bg-muted/40 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary" /> Target {["D", "E", "F"][i]}
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(s.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-1 text-xs text-foreground">{s.address || "No address on record"}</div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {Number(s.latitude).toFixed(6)}, {Number(s.longitude).toFixed(6)}
                {s.apn ? ` · APN ${s.apn}` : ""}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {s.zoning_code ? `${s.zoning_code} · ` : ""}
                {Number.isFinite(s.fit?.max_height_ft)
                  ? `Max ${s.fit.max_height_ft} ft`
                  : "Max height: No data available"}
                {s.fit?.decision ? ` · ${s.fit.decision}` : ""}
              </div>
              {s.ordinance?.source_ref && (
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  Cite: {s.ordinance.source_ref}
                  {s.ordinance.verified ? " (verified)" : " (unverified)"}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}