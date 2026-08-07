import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import HawkBoltBoundaryMap from "@/components/hawkbolt/HawkBoltBoundaryMap";
import ScoutPanel from "@/components/talonscout/ScoutPanel";
import ShadowPanel from "@/components/talonfit/ShadowPanel";

// TalonFit™ — TalonFit-AI-1.0 feasibility solver and boundary map.
export default function TalonFit() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    base44.auth
      .me()
      .then((user) => setIsAdmin(user?.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col p-4">
      <div className="flex items-center gap-2 pb-1">
        <Zap className="h-5 w-5 text-primary" />
        <h1 className="font-heading text-lg font-bold text-foreground">TalonFit™</h1>
        <span className="text-xs text-muted-foreground">
          TalonFit-AI-1.0 feasibility solver · Patent Pending
        </span>
      </div>

      <p className="pb-1 text-[11px] text-muted-foreground">
        Screening tool only — ordinance readings and fit results are not a substitute for a PE-stamped
        drawing or the jurisdiction's own determination.
      </p>

      {/* Admin-only: HawkPerchSolver v2 vs the live engine. Not user-facing. */}
      <ShadowPanel isAdmin={isAdmin} />

      <ScoutPanel />
      <HawkBoltBoundaryMap />
    </div>
  );
}