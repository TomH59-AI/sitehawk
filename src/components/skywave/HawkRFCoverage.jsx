import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { runRFAnalysis } from "@/functions/runRFAnalysis";
import { cloudRFCoverage } from "@/functions/cloudRFCoverage";
import { Loader2, RadioTower, AlertTriangle, Signal } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";
import { sectionLabel, SECTION_KEYS } from "@/lib/scipTarget";
import RFProximityMaps from "@/components/ai-vision/RFProximityMaps";

/**
 * Step 3.7 — RF Proximity & Coverage for the active Target A.
 *
 * Target A is the canonical source: parcel_targets[active_target_index] on the
 * ScipRecord. This step generates THREE things for Target A only:
 *   • Closest airport map   (runRFAnalysis → result.airport, with line_geojson)
 *   • Closest cell tower map (runRFAnalysis → result.tower, with line_geojson)
 *   • CloudRF area coverage  (cloudRFCoverage — independent of nearby towers)
 *
 * Results are stored on record.rf_enrichment keyed by active_target_index, so
 * promoting a backup target to Target A lands in a new slot and regenerates.
 */
export default function HawkRFCoverage({ record, onUpdate }) {
  const [rfLoading, setRfLoading] = useState(false);
  const [covLoading, setCovLoading] = useState(false);
  const [error, setError] = useState(null);

  const targets = record.parcel_targets || [];
  const idx = record.active_target_index || 0;
  const target = targets[idx] || null;
  const slotKey = String(idx);
  const slot = record.rf_enrichment?.[slotKey] || null;

  const lat = target ? Number(target.latitude ?? record.latitude) : null;
  const lon = target ? Number(target.longitude ?? record.longitude) : null;
  const towerHeightFt = Number(record.sarf_height) || 199;
  const ringRadius = Number(record.search_radius) || 1.0;

  async function persistSlot(patch) {
    const next = { ...(record.rf_enrichment || {}) };
    next[slotKey] = {
      target_index: idx,
      target_lat: lat,
      target_lon: lon,
      radius_miles: ringRadius,
      tower_height_ft: towerHeightFt,
      generated_at: new Date().toISOString(),
      ...(next[slotKey] || {}),
      ...patch,
    };
    const updated = await base44.entities.ScipRecord.update(record.id, { rf_enrichment: next });
    onUpdate(updated);
    return updated;
  }

  async function generate() {
    if (!target || lat == null || lon == null || isNaN(lat) || isNaN(lon)) {
      toast.error("Target A must be selected before maps can be generated.");
      return;
    }
    setError(null);
    setRfLoading(true);
    setCovLoading(true);

    // Two INDEPENDENT calls — coverage must run for Target A even if no tower is found.
    const rfPromise = (async () => {
      try {
        const res = await runRFAnalysis({
          lat, lon,
          radius_miles: 2, // proximity always searches a 2-mile radius for the nearest cell tower
          heights_ft: [towerHeightFt],
          force_refresh: true,
        });
        const data = res.data || {};
        // A 404 (no cell tower) still carries usable airport data — keep it.
        return { airport: data.airport || null, tower: data.tower || null, rf: data.rf || null, error: (data.error && !data.airport && !data.tower) ? data.error : null };
      } catch (err) {
        return { error: err.message || "RF analysis failed." };
      }
    })();

    const covPromise = (async () => {
      try {
        const res = await cloudRFCoverage({
          lat, lon,
          height_ft: towerHeightFt,
          radius_mi: Math.max(ringRadius, 5),
          site_name: target.label || record.site_name || "Target A",
          carrier: "verizon",
        });
        const d = res.data || {};
        if (!d.png_url) return { error: d.error || "No coverage returned." };
        return { png_url: d.png_url, bounds: d.bounds || null, key_data: d.key_data || null, area_covered_sq_km: d.area_covered_sq_km ?? null, max_range_km: d.max_range_km ?? null };
      } catch (err) {
        return { error: err.message || "Coverage analysis failed." };
      }
    })();

    const [rf, coverage] = await Promise.all([rfPromise, covPromise]);
    setRfLoading(false);
    setCovLoading(false);

    try {
      await persistSlot({ rf, coverage });
      if (rf.error && coverage.error) setError("Both RF and coverage analysis failed.");
      else toast.success("RF & coverage generated for " + (target.label || "Target A"));
    } catch {
      setError("Saving enrichment failed — try again.");
    }
  }

  const rf = slot?.rf || null;
  const coverage = slot?.coverage || null;

  return (
    <div className="bg-white rounded-lg border p-5 no-print" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <RadioTower className="w-5 h-5" style={{ color: SKYWAVE.blue }} />
          <h3 className="font-bold text-lg" style={{ color: SKYWAVE.navy }}>
            {sectionLabel(SECTION_KEYS.coverage_viewshed)} {target ? `(${target.label || "Target A"})` : ""}
          </h3>
        </div>
        <button
          onClick={generate}
          disabled={rfLoading || covLoading || !target}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: SKYWAVE.blue }}
        >
          {(rfLoading || covLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Signal className="w-4 h-4" />}
          {slot ? "Refresh RF & Coverage" : "Generate RF & Coverage"}
        </button>
      </div>

      <p className="text-xs mb-4" style={{ color: SKYWAVE.muted }}>
        Closest airport &amp; closest cell tower (2-mile search) plus a CloudRF area-coverage prediction — all generated for Target A using a {towerHeightFt} ft tower. Coverage runs even when no nearby cell tower is found.
      </p>

      {!target && (
        <div className="flex items-center gap-2 text-sm rounded-lg p-3" style={{ background: "#FEF3C7", color: "#92400E" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Target A must be selected before maps can be generated. Run Section 1 (Find 3 Best Parcels) first.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm rounded-lg p-3 mb-3" style={{ background: "#FEE2E2", color: "#991B1B" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Airport + cell tower proximity maps */}
      {(rfLoading) && (
        <div className="flex flex-col items-center justify-center p-10 text-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: SKYWAVE.blue }} />
          <p className="text-sm font-medium" style={{ color: SKYWAVE.navy }}>Analyzing proximity — airport &amp; cell tower…</p>
        </div>
      )}
      {!rfLoading && rf && !rf.error && (
        <div className="mb-5">
          <RFProximityMaps site={{ lat, lon, radius: 2 }} result={rf} />
        </div>
      )}
      {!rfLoading && rf?.error && (
        <div className="flex items-center gap-2 text-sm rounded-lg p-3 mb-3" style={{ background: "#FEE2E2", color: "#991B1B" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" /> Proximity analysis failed: {rf.error}
        </div>
      )}

      {/* CloudRF coverage */}
      {covLoading && (
        <div className="flex flex-col items-center justify-center p-10 text-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: SKYWAVE.blue }} />
          <p className="text-sm font-medium" style={{ color: SKYWAVE.navy }}>Computing RF coverage for Target A…</p>
        </div>
      )}
      {!covLoading && coverage && !coverage.error && coverage.png_url && (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: SKYWAVE.line }}>
          <div className="px-4 py-2 border-b" style={{ borderColor: SKYWAVE.line }}>
            <div className="text-[10px] font-mono tracking-[0.3em]" style={{ color: SKYWAVE.blue }}>RF COVERAGE — CLOUDRF</div>
            <div className="text-sm font-bold" style={{ color: SKYWAVE.navy }}>
              {towerHeightFt} ft tower
              {coverage.max_range_km != null ? ` · ${(coverage.max_range_km * 0.621371).toFixed(1)} mi max range` : ""}
              {coverage.area_covered_sq_km != null ? ` · ${(coverage.area_covered_sq_km * 0.386102).toFixed(1)} sq mi covered` : ""}
            </div>
          </div>
          <img src={coverage.png_url} alt="RF coverage prediction" className="w-full block" style={{ background: "#0C1B2E" }} />
        </div>
      )}
      {!covLoading && coverage?.error && (
        <div className="flex items-center gap-2 text-sm rounded-lg p-3" style={{ background: "#FEE2E2", color: "#991B1B" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" /> Coverage analysis failed: {coverage.error}
        </div>
      )}
    </div>
  );
}