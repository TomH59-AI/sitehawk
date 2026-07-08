import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";
import { MILESTONE_LABELS, STATUS_META } from "@/lib/hawkTracker";
import { Badge } from "@/components/ui/badge";

// Recent milestone activity across the pilot client's sites (read-only).
export default function PilotActivityFeed({ items, siteNames }) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No recent activity yet — updates will appear here as your sites move.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border">
      {items.map((m) => {
        const meta = STATUS_META[m.status] || STATUS_META.pending;
        return (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <Activity className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {siteNames[m.tracker_site_id] || "Site"} — {MILESTONE_LABELS[m.milestone] || m.milestone}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(m.updated_date), { addSuffix: true })}
              </div>
            </div>
            <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
          </div>
        );
      })}
    </div>
  );
}