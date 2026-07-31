import { Zap } from "lucide-react";
import HawkBoltBoundaryMap from "@/components/hawkbolt/HawkBoltBoundaryMap";
import ScoutPanel from "@/components/talonscout/ScoutPanel";

// TalonFit® — ordinance-intelligence engine: ten-target scout + boundary map.
export default function TalonFit() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col p-4">
      <div className="flex items-center gap-2 pb-1">
        <Zap className="h-5 w-5 text-primary" />
        <h1 className="font-heading text-lg font-bold text-foreground">TalonFit®</h1>
        <span className="text-xs text-muted-foreground">AI ordinance-intelligence engine · Patent Pending</span>
      </div>

      <p className="pb-1 text-[11px] text-muted-foreground">
        Screening tool only — ordinance readings and fit grades are not a substitute for a PE-stamped
        drawing or the jurisdiction's own determination.
      </p>

      <ScoutPanel />
      <HawkBoltBoundaryMap />
    </div>
  );
}