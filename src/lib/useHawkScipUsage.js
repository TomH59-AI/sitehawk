import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

// Tier limits for Search Rings. 1 Search Ring = 1 SCIP bundle that INCLUDES all
// three AI-selected targets (A, B & C) — spent once per ring (SARF center
// site_key) at Run Zoning. Free = 1 lifetime trial; paid tiers reset monthly;
// hawkeye_apex is unlimited. Mirrors the server-side quota rules — this is
// display-only (real enforcement lives in the backend 402).
export const TIER_CONFIG = {
  free: { label: "Free", limit: 1, window: "lifetime" },
  hawk_site: { label: "HawkSite", limit: 15, window: "month" },
  hawkeyes: { label: "Hawkeyes", limit: 40, window: "month" },
  hawkeye_apex: { label: "Apex", limit: Infinity, window: "month" },
};

function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// Live HawkSCIP usage for the current user: tier, limit, used and remaining.
// Counts HawkScipSpend rows (lifetime for free, since month-start for paid).
export function useHawkScipUsage() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const user = await base44.auth.me();
      if (!user) { setUsage(null); setLoading(false); return; }

      const tierKey = TIER_CONFIG[user.tier] ? user.tier : "free";
      const cfg = TIER_CONFIG[tierKey];

      let used = 0;
      if (cfg.limit !== Infinity) {
        const query = cfg.window === "month"
          ? { user_email: user.email, created_date: { $gte: startOfMonthISO() } }
          : { user_email: user.email };
        const rows = await base44.entities.HawkScipSpend.filter(query, "-created_date", 500);
        used = Array.isArray(rows) ? rows.length : 0;
      }

      const remaining = cfg.limit === Infinity ? Infinity : Math.max(0, cfg.limit - used);
      setUsage({ tier: tierKey, label: cfg.label, window: cfg.window, limit: cfg.limit, used, remaining });
    } catch {
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { usage, loading, refresh };
}