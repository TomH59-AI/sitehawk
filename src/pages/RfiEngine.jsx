import { Radar } from "lucide-react";
import RfiMap from "@/components/rfi/RfiMap";

// RF Intelligence Engine — standalone flagship module. Nationwide RF map with
// towers (OpenCellID/FCC), on-demand CloudRF coverage, and derived dead zones.
// Completely independent of the SCIP pipeline.
export default function RfiEngine() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card shrink-0">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Radar className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-lg leading-tight">RF Intelligence Engine</h1>
          <p className="text-xs text-muted-foreground">
            Nationwide towers, coverage &amp; dead zones — carrier, band and technology visualization.
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <RfiMap />
      </div>
    </div>
  );
}