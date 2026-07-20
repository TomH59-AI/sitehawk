import RfiMap from "@/components/rfi/RfiMap";
import AppErrorBoundary from "@/components/AppErrorBoundary";

// RF INTELLIGENCE MAP — nationwide U.S. RF map, embedded in the Map Suite
// pipeline after the 2D Viewshed maps and before the Compliance report.
// Isolated in its own error boundary so a map/WebGL hiccup can never blank the page.
export default function RfiPipelineSection() {
  return (
    <div className="space-y-2" data-section="rfi-map">
      <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-accent/15 via-transparent to-transparent border border-accent/30">
        <div className="text-[10px] font-mono text-accent tracking-[0.3em] mb-0.5">SCIP · RF INTELLIGENCE ENGINE</div>
        <div className="font-heading font-bold text-foreground">
          Nationwide RF Intelligence Map
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Live U.S. tower coverage, carriers, and dead zones. Zoom in to load towers; use the search box to jump to your SARF site.
        </div>
      </div>
      <div className="relative h-[560px] rounded-2xl overflow-hidden border border-border shadow-sm">
        <AppErrorBoundary>
          <RfiMap overlays={{ sites: true, rings: true }} />
        </AppErrorBoundary>
      </div>
    </div>
  );
}