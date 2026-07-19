import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useHawkScipUsage } from "@/lib/useHawkScipUsage";
import { Activity, Loader2 } from "lucide-react";

// Per-customer usage — Search Ring (SCIP) consumption + HawkLease sites.
export default function BillingUsageSection({ leaseSiteCap }) {
  const { usage, loading } = useHawkScipUsage();
  const [leaseCount, setLeaseCount] = useState(null);

  useEffect(() => {
    base44.entities.HawkLeaseSite.list("-created_date", 500)
      .then((rows) => setLeaseCount(Array.isArray(rows) ? rows.length : 0))
      .catch(() => setLeaseCount(0));
  }, []);

  const pct = usage && usage.limit !== Infinity && usage.limit > 0
    ? Math.min(100, Math.round((usage.used / usage.limit) * 100))
    : 0;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-primary" />
        <h2 className="font-heading font-bold text-lg text-foreground">Your Usage</h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading usage…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search Rings / SCIPs */}
          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="font-medium text-foreground">Search Rings (SCIPs)</span>
              <span className="text-muted-foreground">
                {usage?.limit === Infinity
                  ? `${usage?.used ?? 0} used · Unlimited`
                  : `${usage?.used ?? 0} of ${usage?.limit ?? 0} ${usage?.window === "day" ? "today" : usage?.window === "month" ? "this month" : "lifetime"}`}
              </span>
            </div>
            {usage?.limit !== Infinity && (
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>

          {/* HawkLease sites */}
          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="font-medium text-foreground">HawkLease Sites</span>
              <span className="text-muted-foreground">
                {leaseCount === null
                  ? "…"
                  : leaseSiteCap === Infinity
                  ? `${leaseCount} sites · Unlimited`
                  : leaseSiteCap > 0
                  ? `${leaseCount} of ${leaseSiteCap} sites`
                  : `${leaseCount} sites`}
              </span>
            </div>
            {leaseCount !== null && leaseSiteCap > 0 && leaseSiteCap !== Infinity && (
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, Math.round((leaseCount / leaseSiteCap) * 100))}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}