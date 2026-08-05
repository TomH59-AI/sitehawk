import { Crosshair, Loader2 } from "lucide-react";

/**
 * The TalonFit anchor is NOT user-chosen — it is the exact coordinate of the
 * Target the subscriber just ran the SCIP on. That point is the search-ring
 * center; the 2-mile ring is drawn around it.
 */
export default function ScoutAnchorBanner({ loading, anchor, error }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your SCIP target anchor…
      </div>
    );
  }
  if (!anchor) {
    return (
      <div className="px-3 py-3 text-sm text-muted-foreground">
        {error || "No SCIP target found. Run a SCIP on a target first — TalonFit anchors its 2-mile search ring on that exact coordinate."}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <Crosshair className="h-4 w-4 shrink-0 text-primary" />
      <span className="font-semibold text-foreground">Anchored to your SCIP target</span>
      <span className="truncate text-muted-foreground">{anchor.label}</span>
      <span className="font-mono text-xs text-muted-foreground">
        {anchor.lat.toFixed(6)}, {anchor.lon.toFixed(6)}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">2-mile search ring (10,560 ft)</span>
    </div>
  );
}