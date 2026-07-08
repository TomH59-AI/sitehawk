import { Badge } from "@/components/ui/badge";
import { MapPin, AlertTriangle } from "lucide-react";
import { MILESTONES, MILESTONE_LABELS } from "@/lib/hawkTracker";

// Simplified site card for pilot clients — name, status, progress. No editing.
export default function PilotSiteCard({ site }) {
  const stageIndex = MILESTONES.findIndex((m) => m.key === site.current_status);
  const progress = stageIndex >= 0 ? Math.round(((stageIndex + 1) / (MILESTONES.length - 1)) * 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-heading font-bold text-foreground">{site.site_name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {[site.market, site.jurisdiction, site.state].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        {site.is_blocked ? (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 gap-1">
            <AlertTriangle className="w-3 h-3" /> Blocked
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">On Track</Badge>
        )}
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">Current stage</span>
          <span className="font-medium text-foreground">{MILESTONE_LABELS[site.current_status] || "—"}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${site.is_blocked ? "bg-red-500" : "bg-primary"}`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{site.carrier || ""}</span>
        {site.target_on_air && <span>Target on-air: {site.target_on_air}</span>}
      </div>
    </div>
  );
}