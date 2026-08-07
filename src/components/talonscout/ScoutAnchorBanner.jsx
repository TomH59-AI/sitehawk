import { Crosshair, Loader2 } from "lucide-react";

/**
 * The TalonFit anchor is the EXACT waypoint coordinates the user entered for
 * their search ring (the SARF center) — with an extra mile added, giving a
 * 2-mile clickable radius to scout up to three more sites (D·E·F).
 */
export default function ScoutAnchorBanner({ loading, anchor, error }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your search-ring waypoint…
      </div>
    );
  }
  if (!anchor) {
    return (
      <div className="px-3 py-3 text-sm text-muted-foreground">
        {error || "No search ring found. Run a SCIP first — TalonFit anchors on the exact waypoint coordinates you entered and adds an extra mile, giving you a 2-mile radius to scout more sites."}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <Crosshair className="h-4 w-4 shrink-0 text-primary" />
      <span className="font-semibold text-foreground">Anchored to your entered waypoint</span>
      <span className="truncate text-muted-foreground">{anchor.label}</span>
      <span className="font-mono text-xs text-muted-foreground">
        {anchor.lat.toFixed(6)}, {anchor.lon.toFixed(6)}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">2-mile search ring (10,560 ft)</span>
    </div>
  );
}