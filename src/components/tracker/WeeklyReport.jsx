import { format } from "date-fns";
import { Printer, AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MILESTONE_LABELS, STATUS_META, TRACKER_GREEN } from "@/lib/hawkTracker";

// The Friday call report: everything that moved in the last 7 days, one block
// per market, blocked sites pinned red at top, sorted by target_on_air ascending.
export default function WeeklyReport({ sites, milestones }) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // Latest milestone movement (updated within 7 days) per site.
  const movementBySite = {};
  for (const m of milestones) {
    if (m.backfilled) continue; // import backfill is not real movement
    const ts = new Date(m.updated_date).getTime();
    if (ts < cutoff) continue;
    const cur = movementBySite[m.tracker_site_id];
    if (!cur || ts > new Date(cur.updated_date).getTime()) movementBySite[m.tracker_site_id] = m;
  }

  // Group by market; blocked first, then target_on_air ascending (nulls last).
  const byMarket = {};
  for (const s of sites) {
    const key = s.market || "Unassigned Market";
    (byMarket[key] = byMarket[key] || []).push(s);
  }
  const sortSites = (a, b) => {
    if (a.is_blocked !== b.is_blocked) return a.is_blocked ? -1 : 1;
    const da = a.target_on_air ? new Date(a.target_on_air).getTime() : Infinity;
    const db = b.target_on_air ? new Date(b.target_on_air).getTime() : Infinity;
    return da - db;
  };

  const markets = Object.keys(byMarket).sort();

  if (!sites.length) {
    return <div className="text-sm text-muted-foreground py-8 text-center">No tracker sites yet — add a site to start the weekly report.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <div className="text-sm text-muted-foreground">
          Week ending {format(new Date(), "MMM d, yyyy")} · movement window: last 7 days
        </div>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1" /> Print / Save PDF
        </Button>
      </div>

      {markets.map((market) => (
        <div key={market} className="rounded-xl border border-border overflow-hidden bg-card" style={{ breakInside: "avoid" }}>
          <div className="px-4 py-2 text-white font-heading font-bold text-sm tracking-wide" style={{ background: TRACKER_GREEN, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
            {market} — Weekly Deployment Report
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="px-3 py-2 font-semibold">Site</th>
                <th className="px-3 py-2 font-semibold">Carrier</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Moved This Week</th>
                <th className="px-3 py-2 font-semibold text-right">Target On-Air</th>
              </tr>
            </thead>
            <tbody>
              {byMarket[market].sort(sortSites).map((s) => {
                const mv = movementBySite[s.id];
                return (
                  <tr key={s.id} className={`border-b border-border last:border-0 ${s.is_blocked ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        {s.is_blocked && <AlertOctagon className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                        {s.site_name}
                        {s.carrier_site_number ? <span className="font-mono text-muted-foreground font-normal">#{s.carrier_site_number}</span> : null}
                      </div>
                      {s.is_blocked && s.blocked_reason && (
                        <div className="text-red-700 dark:text-red-400 font-medium mt-0.5">⛔ {s.blocked_reason}</div>
                      )}
                      {s.jurisdiction && <div className="text-muted-foreground">{s.jurisdiction}{s.state ? `, ${s.state}` : ""}</div>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{s.carrier || "—"}</td>
                    <td className="px-3 py-2 font-medium" style={{ color: TRACKER_GREEN }}>
                      {MILESTONE_LABELS[s.current_status] || s.current_status}
                    </td>
                    <td className="px-3 py-2">
                      {mv ? (
                        <>
                          <span className="font-medium text-foreground">{MILESTONE_LABELS[mv.milestone]}</span>
                          <span className="text-muted-foreground"> → {STATUS_META[mv.status]?.label || mv.status}</span>
                          {mv.notes && <div className="text-muted-foreground italic mt-0.5">"{mv.notes}"</div>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">No movement</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                      {s.target_on_air ? format(new Date(s.target_on_air), "MMM d, yyyy") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}