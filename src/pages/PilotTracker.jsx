import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Radar } from "lucide-react";
import PilotSiteCard from "@/components/tracker/PilotSiteCard";
import PilotActivityFeed from "@/components/tracker/PilotActivityFeed";

// Simplified HawkTracker view for pilot clients — read-only: their saved
// sites + recent milestone activity. RLS already scopes rows to the user.
export default function PilotTracker() {
  const [sites, setSites] = useState(null);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    (async () => {
      const siteRows = await base44.entities.HawkTrackerSite.list("-updated_date", 100);
      setSites(siteRows);
      const milestones = await base44.entities.HawkTrackerMilestone.list("-updated_date", 200);
      const siteIds = new Set(siteRows.map((s) => s.id));
      setActivity(
        milestones
          .filter((m) => siteIds.has(m.tracker_site_id) && !m.backfilled && m.status !== "pending")
          .slice(0, 15)
      );
    })();
  }, []);

  const siteNames = Object.fromEntries((sites || []).map((s) => [s.id, s.site_name]));

  if (sites === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Radar className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">My Sites</h1>
          <p className="text-sm text-muted-foreground">Your saved sites and where each one stands.</p>
        </div>
      </div>

      {sites.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No saved sites yet. Sites you add in Hawk Tracker will appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sites.map((s) => <PilotSiteCard key={s.id} site={s} />)}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="font-heading font-semibold text-lg text-foreground">Recent Activity</h2>
        <PilotActivityFeed items={activity} siteNames={siteNames} />
      </div>
    </div>
  );
}