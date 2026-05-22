/**
 * SCIPPage1TowerPlacement — Page 1 TOWER PLACEMENT & COMPOUND SITING block.
 *
 * Auto-runs the deterministic Tower Placement engine on Target A's parcel
 * geometry using the tower height + compound size already entered on Page 1.
 * Shows:
 *   • Setback / fall-zone math
 *   • Pass/fail compliance per property line (N/S/E/W)
 *   • Compound + access easement dimensions
 *   • Owner-retained acreage (useful for lease negotiation)
 *   • FAA / FEMA / wetlands regulatory warnings
 *   • A scale-accurate site plan SVG of the tower + compound on the parcel
 *
 * Requires `candidate.parcel_geometry` (most FL/NC parcels have it; if missing
 * we show a brief notice).
 */

import { useMemo } from "react";
import { Compass } from "lucide-react";
import { computeTowerPlacement } from "@/lib/towerPlacement";
import SitePlanSVG from "../tower/SitePlanSVG";

// Parse "100x100", "100 x 100", "10000 SF", "100' x 100'" → side length in feet
function parseCompoundSize(raw) {
  if (!raw) return 100;
  const s = String(raw).toLowerCase().replace(/[',]/g, "");
  const x = s.match(/(\d+)\s*x\s*(\d+)/);
  if (x) return Math.max(parseInt(x[1], 10), parseInt(x[2], 10));
  const sf = s.match(/(\d+)\s*(sf|sq|square)/);
  if (sf) return Math.round(Math.sqrt(parseInt(sf[1], 10)));
  const n = parseFloat(s);
  return isFinite(n) && n > 0 ? n : 100;
}

function parseFt(raw, fallback) {
  if (!raw) return fallback;
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : fallback;
}

function StatPill({ label, value, tone = "neutral" }) {
  const colors = {
    pass: "bg-green-500/10 text-green-700 border-green-500/30",
    fail: "bg-red-500/10 text-red-700 border-red-500/30",
    neutral: "bg-muted/40 text-foreground border-border",
  };
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${colors[tone]}`}>
      <div className="font-mono uppercase tracking-wider text-[10px] opacity-70">{label}</div>
      <div className="font-bold text-sm mt-0.5">{value}</div>
    </div>
  );
}

export default function SCIPPage1TowerPlacement({ page1Values, candidate }) {
  const analysis = useMemo(() => {
    if (!candidate?.parcel_geometry) return null;
    const towerHeightFt = parseFt(page1Values?.sarf_height, 199);
    const compoundSizeFt = parseCompoundSize(page1Values?.compound_size);
    const towerType = (page1Values?.tower_type || "monopole").toLowerCase().includes("lattice")
      ? "self_support"
      : (page1Values?.tower_type || "monopole").toLowerCase().includes("guyed")
      ? "guyed"
      : "monopole";
    return computeTowerPlacement(candidate, {
      towerHeightFt,
      towerType,
      compoundSizeFt,
      accessPreference: "northeast",
    });
  }, [candidate, page1Values?.sarf_height, page1Values?.compound_size, page1Values?.tower_type]);

  return (
    <>
      <div className="px-3 py-2 bg-[#0C1B2E] text-white text-xs font-bold tracking-widest uppercase flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Compass className="w-3.5 h-3.5" /> Tower Placement & Compound Siting
        </span>
        <span className="text-[10px] opacity-70 font-mono">Target A · auto-computed</span>
      </div>

      {!candidate?.parcel_geometry && (
        <div className="px-3 py-3 bg-amber-500/10 border-b border-amber-500/30 text-xs text-amber-900">
          Parcel geometry not available for this candidate — placement math requires a parcel polygon.
          Re-run Find Best Parcel, or proceed with field-survey-based siting.
        </div>
      )}

      {analysis && !analysis.ok && (
        <div className="px-3 py-3 bg-red-500/10 border-b border-red-500/30 text-xs text-red-800">
          <div className="font-bold mb-1">Parcel cannot accommodate the proposed tower</div>
          <div>{analysis.message}</div>
        </div>
      )}

      {analysis?.ok && (
        <div className="p-4 space-y-4 bg-card">
          {/* Headline metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatPill label="Tower Height" value={`${analysis.towerHeightFt} ft AGL`} />
            <StatPill label="Setback / Fall-Zone" value={`${analysis.setbackFt} ft`} />
            <StatPill label="Compound" value={`${analysis.compoundSizeFt}' × ${analysis.compoundSizeFt}'`} />
            <StatPill
              label="Compliance"
              value={analysis.compliant ? "✓ All sides pass" : "✗ Encroachment"}
              tone={analysis.compliant ? "pass" : "fail"}
            />
          </div>

          {/* Per-side compliance */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {["north", "south", "east", "west"].map((dir) => (
              <StatPill
                key={dir}
                label={`${dir} setback`}
                value={`${Math.round(analysis.distances[`${dir}_ft`])} ft ${analysis.compliance[dir] ? "✓" : "✗"}`}
                tone={analysis.compliance[dir] ? "pass" : "fail"}
              />
            ))}
          </div>

          {/* Land math */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <StatPill label="Parcel Total" value={`${analysis.areas.totalAcres.toFixed(2)} ac`} />
            <StatPill label="Compound (lease)" value={`${analysis.areas.compoundAcres.toFixed(3)} ac`} />
            <StatPill
              label="Owner Retained"
              value={`${analysis.areas.ownerRetainedAcres.toFixed(2)} ac (${analysis.areas.ownerRetainedPct.toFixed(0)}%)`}
            />
            <StatPill
              label="Access Easement"
              value={`${analysis.accessEasement.widthFt}' × ${Math.round(analysis.accessEasement.lengthFt)}'`}
            />
            <StatPill
              label="Tower Base"
              value={`${analysis.placement.lat.toFixed(6)}, ${analysis.placement.lon.toFixed(6)}`}
            />
            <StatPill label="Corner Chosen" value={analysis.placement.cornerLabel} />
          </div>

          {/* Regulatory warnings */}
          {analysis.warnings.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="text-[10px] font-bold tracking-wider uppercase text-amber-800 mb-1.5">
                Regulatory Flags
              </div>
              <ul className="space-y-1 text-xs text-amber-900">
                {analysis.warnings.map((w, i) => (
                  <li key={i} className="flex gap-2">
                    <span>•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Scale-accurate site plan */}
          <div className="rounded-md border border-border overflow-hidden">
            <SitePlanSVG analysis={analysis} parcel={candidate} />
          </div>
        </div>
      )}
    </>
  );
}