import { Clock } from "lucide-react";
import { daysSince, shotClock, SHPO_RUNNING, THPO_RUNNING, HC } from "./complianceConst";

// "Shot Clocks Running" widget — summarizes every active SHPO/THPO clock across all sites.
export default function ShotClocksWidget({ records }) {
  const clocks = [];
  records.forEach((r) => {
    (r.shpoRecords || []).forEach((s) => {
      if (s.determination === SHPO_RUNNING && s.submissionDate)
        clocks.push({ site: r.siteName, who: `SHPO ${s.state || ""}`.trim(), days: daysSince(s.submissionDate) });
    });
    (r.thpoRecords || []).forEach((t) => {
      if (t.status === THPO_RUNNING && t.notificationDate)
        clocks.push({ site: r.siteName, who: t.tribeName || "THPO", days: daysSince(t.notificationDate) });
    });
  });

  clocks.sort((a, b) => (b.days || 0) - (a.days || 0));

  if (!clocks.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4" style={{ color: HC.green }} />
        <h3 className="font-heading font-semibold text-sm">Shot Clocks Running</h3>
        <span className="text-xs text-muted-foreground">({clocks.length} active)</span>
      </div>
      <div className="space-y-2">
        {clocks.slice(0, 8).map((c, i) => {
          const sc = shotClock(c.days);
          return (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sc.color }} />
              <span className="font-medium truncate flex-1">{c.site}</span>
              <span className="text-muted-foreground text-xs truncate">{c.who}</span>
              <span className="text-xs font-semibold w-20 text-right" style={{ color: sc.color }}>Day {c.days}/30</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}