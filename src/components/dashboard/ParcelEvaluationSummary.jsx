/**
 * ParcelEvaluationSummary — Dashboard summary card that breaks down all
 * evaluated parcels by:
 *   • Zoning classification (top N + an "Other / Unzoned" bucket)
 *   • Build feasibility status (Buildable / Marginal / Not Buildable / Unknown)
 *
 * Feasibility is derived deterministically from the SearchResult record:
 *   - Not Buildable: FEMA SFHA on-site, or on-site NWI wetlands, or score < 40
 *   - Marginal:     adjacent wetlands, high FEMA risk, or score 40–69
 *   - Buildable:    score ≥ 70 and no environmental flags
 *   - Unknown:      missing score
 */

import { useMemo } from "react";
import { Layers, ShieldCheck, ShieldAlert, ShieldX, HelpCircle } from "lucide-react";

const TOP_ZONING_COUNT = 6;

function classifyFeasibility(r) {
  const score = r.match_score ?? null;
  const onSiteWetland = r.wetlands_present === true && r.wetland_proximity === "on-site";
  const adjacentWetland = r.wetlands_present === true && r.wetland_proximity === "adjacent";
  const highFlood = r.fema_sfha === true || r.fema_risk_level === "high";

  if (onSiteWetland || (highFlood && r.fema_sfha === true) || (score != null && score < 40)) {
    return "not_buildable";
  }
  if (adjacentWetland || highFlood || (score != null && score < 70)) {
    return "marginal";
  }
  if (score != null && score >= 70) return "buildable";
  return "unknown";
}

function normalizeZoning(z) {
  if (!z || typeof z !== "string") return "Unzoned / Unknown";
  const trimmed = z.trim();
  if (!trimmed || trimmed === "N/A") return "Unzoned / Unknown";
  return trimmed.toUpperCase();
}

const FEASIBILITY_META = {
  buildable: {
    label: "Buildable",
    icon: ShieldCheck,
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    text: "text-green-700",
    bar: "bg-green-500",
  },
  marginal: {
    label: "Marginal",
    icon: ShieldAlert,
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-700",
    bar: "bg-amber-500",
  },
  not_buildable: {
    label: "Not Buildable",
    icon: ShieldX,
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-700",
    bar: "bg-red-500",
  },
  unknown: {
    label: "Unknown",
    icon: HelpCircle,
    bg: "bg-muted/40",
    border: "border-border",
    text: "text-muted-foreground",
    bar: "bg-muted-foreground/60",
  },
};

export default function ParcelEvaluationSummary({ results }) {
  const { total, byZoning, byFeasibility } = useMemo(() => {
    const list = results || [];
    const zoningCounts = new Map();
    const feasCounts = { buildable: 0, marginal: 0, not_buildable: 0, unknown: 0 };

    for (const r of list) {
      const z = normalizeZoning(r.zoning_classification);
      zoningCounts.set(z, (zoningCounts.get(z) || 0) + 1);
      feasCounts[classifyFeasibility(r)] += 1;
    }

    // Sort zoning by count desc, keep top N, roll the rest into "Other"
    const sorted = [...zoningCounts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, TOP_ZONING_COUNT);
    const rest = sorted.slice(TOP_ZONING_COUNT);
    if (rest.length > 0) {
      const otherTotal = rest.reduce((acc, [, c]) => acc + c, 0);
      top.push([`Other (${rest.length})`, otherTotal]);
    }

    return { total: list.length, byZoning: top, byFeasibility: feasCounts };
  }, [results]);

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-5 h-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg text-foreground">Parcel Evaluation Summary</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          No parcels evaluated yet. Run your first scan to see zoning and feasibility breakdowns here.
        </p>
      </div>
    );
  }

  const maxZoning = Math.max(...byZoning.map(([, c]) => c), 1);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg text-foreground">Parcel Evaluation Summary</h2>
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="font-bold text-foreground text-base mr-1">{total}</span>
          parcels evaluated
        </div>
      </div>

      {/* Feasibility status grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["buildable", "marginal", "not_buildable", "unknown"]).map((key) => {
          const meta = FEASIBILITY_META[key];
          const count = byFeasibility[key];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const Icon = meta.icon;
          return (
            <div key={key} className={`rounded-xl border p-3 ${meta.bg} ${meta.border}`}>
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${meta.text}`} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.text}`}>
                  {meta.label}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-heading font-bold text-2xl text-foreground">{count}</span>
                <span className="text-xs text-muted-foreground">/ {total} ({pct}%)</span>
              </div>
              <div className="mt-2 h-1.5 bg-background/60 rounded-full overflow-hidden">
                <div className={`h-full ${meta.bar}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Zoning breakdown */}
      <div>
        <div className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground mb-3">
          Zoning Classification
        </div>
        <div className="space-y-2">
          {byZoning.map(([zone, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const barPct = (count / maxZoning) * 100;
            return (
              <div key={zone} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-mono font-semibold text-foreground truncate" title={zone}>
                      {zone}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {count} · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${barPct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}