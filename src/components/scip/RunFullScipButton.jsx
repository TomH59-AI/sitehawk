/**
 * RunFullScipButton — pipeline guard + sequential SCIP runner.
 *
 * Refuses to run if no parcel_targets exist (unless legacy override is chosen).
 * When targets exist, runs all target-specific sections in sequence for the
 * active target (defaulting to Target A / index 0) and shows a completion
 * summary naming the target used.
 *
 * Zoning & Permitting runs FIRST (canonical pipeline: SARF → Zoning → Targets →
 * Maps) so scipMapSuite below receives a REAL jurisdiction — never "Unknown".
 *
 * Each optional enrichment failure records its error but does not block
 * subsequent sections. Required sections (hawk_maps) failure does abort.
 */
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";
import {
  resolveScipActiveTarget,
  stampPatch,
  SECTION_KEYS,
} from "@/lib/scipTarget";
import { jurisdictionZoningCache } from "@/functions/jurisdictionZoningCache";
import { generateZoningPermitReport } from "@/functions/generateZoningPermitReport";
import { scipMapSuite } from "@/functions/scipMapSuite";
import { scipPowerAirportMaps } from "@/functions/scipPowerAirportMaps";
import { scipExistingConditions } from "@/functions/scipExistingConditions";
import { runRFAnalysis } from "@/functions/runRFAnalysis";
import { cloudRFCoverage } from "@/functions/cloudRFCoverage";

export default function RunFullScipButton({ record, onUpdate }) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]); // [{label, status}]
  const [done, setDone] = useState(false);

  const targets = record?.parcel_targets || [];
  const ctx = resolveScipActiveTarget(record);
  const hasTargets = targets.length > 0 && !ctx.is_legacy_fallback;

  function addLog(label, status) {
    setLog((prev) => [...prev, { label, status }]);
  }

  async function run(allowLegacy = false) {
    if (!hasTargets && !allowLegacy) return;

    setRunning(true);
    setDone(false);
    setLog([]);

    const ctx = resolveScipActiveTarget(record);
    let current = record;

    if (!ctx.lat || !ctx.lon) {
      toast.error("No usable coordinates for the active target — cannot run SCIP.");
      setRunning(false);
      return;
    }

    addLog(`Starting full SCIP for ${ctx.target_label}…`, "running");

    // Helper: update record + propagate to parent
    async function updateRecord(patch) {
      const updated = await base44.entities.ScipRecord.update(current.id, patch);
      current = updated;
      onUpdate(updated);
      return updated;
    }

    // 1. Zoning & Permitting — runs FIRST (canonical: SARF → Zoning → Targets → Maps)
    //    so HAWK MAPS below receives a REAL jurisdiction instead of "Unknown".
    //    Reuse ladder: this record's snapshot → app-wide jurisdiction cache → fetch.
    //    The HawkSCIP quota gate lives inside generateZoningPermitReport, so cache
    //    hits and re-runs burn nothing. Failure is non-fatal — maps fall back to county.
    try {
      addLog("Zoning & Permitting…", "running");
      const zlat = Number.isFinite(Number(current.latitude)) ? Number(current.latitude) : ctx.lat;
      const zlon = Number.isFinite(Number(current.longitude)) ? Number(current.longitude) : ctx.lon;
      const district = ctx.zoning_classification || undefined;
      if (current.zoning_report && Object.keys(current.zoning_report).length > 0 && current.zoning_jurisdiction) {
        addLog("Zoning & Permitting — reused from this SCIP", "done");
      } else {
        let applied = false;
        const look = await jurisdictionZoningCache({ action: "lookup", lat: zlat, lon: zlon, zoning_district: district }).catch(() => null);
        if (look?.data?.cache === "hit" && look.data?.report) {
          await updateRecord({
            zoning_report: look.data.report,
            zoning_jurisdiction: look.data?.jurisdiction?.jurisdiction_name || current.zoning_jurisdiction || "",
          });
          applied = true;
          addLog("Zoning & Permitting — reused jurisdiction cache", "done");
        }
        if (!applied) {
          const gen = await generateZoningPermitReport({
            lat: zlat, lon: zlon,
            candidate: (ctx.parcel_address || ctx.zoning_classification)
              ? { parcel_address: ctx.parcel_address, zoning_classification: ctx.zoning_classification }
              : undefined,
          });
          const r = gen.data?.report;
          if (!r) throw new Error("no zoning report returned");
          const save = await jurisdictionZoningCache({
            action: "save", lat: zlat, lon: zlon, zoning_district: district,
            report: r,
            zone_code: gen.data?.zoneomics?.zone_code || null,
            zoneomics_ok: !!gen.data?.sources_used?.zoneomics,
            raw_response: { zoneomics: gen.data?.zoneomics || null },
          }).catch(() => null);
          await updateRecord({
            zoning_report: r,
            zoning_jurisdiction: save?.data?.jurisdiction?.jurisdiction_name || current.zoning_jurisdiction || "",
          });
          addLog("Zoning & Permitting — fetched & cached", "done");
        }
      }
    } catch (e) {
      addLog(`Zoning failed: ${e.message} — maps will fall back to county`, "warn");
    }

    // 2. HAWK MAPS (required)
    try {
      addLog("HAWK MAPS (Aerial / Topo / Floodplain / Zoning)…", "running");
      const res = await scipMapSuite({
        targets: [{
          label: ctx.target_label,
          site_name: current.site_name || "Site",
          lat: ctx.lat,
          lng: ctx.lon,
          apn: ctx.apn || null,
          owner: ctx.owner_name || null,
        }],
        jurisdiction: current.zoning_jurisdiction || current.county || "Unknown",
        state: (current.state || "XX").toUpperCase(),
        search_radius_mi: Number(current.search_radius) || 1.0,
      });
      const targetMaps = res.data?.targets?.[0]?.maps || [];
      if (!targetMaps.length) throw new Error("No maps returned");
      const byType = Object.fromEntries(targetMaps.map((m) => [m.type, m]));
      const hawk_maps = {
        aerial_url: byType.aerial?.url || "",
        topography_url: byType.topography?.url || "",
        floodplain_url: byType.floodplain?.url || "",
        zoning_url: byType.zoning?.url || "",
        zone_code: byType.zoning?.zone_code || "",
        center_amsl_ft: byType.topography?.center_amsl_ft ?? null,
      };
      await updateRecord({ hawk_maps, ...stampPatch(current, SECTION_KEYS.hawk_maps) });
      addLog("HAWK MAPS", "done");
    } catch (e) {
      addLog(`HAWK MAPS failed: ${e.message}`, "error");
      toast.error("HAWK MAPS failed — aborting SCIP run.");
      setRunning(false);
      return;
    }

    // 3. RF Proximity & Coverage (optional — failure logged, not fatal)
    try {
      addLog("RF Proximity & Coverage…", "running");
      const towerHeightFt = Number(current.sarf_height) || 199;
      const ringRadius = Number(current.search_radius) || 1.0;
      const slotKey = String(ctx.target_index);

      const [rfRes, covRes] = await Promise.all([
        runRFAnalysis({ lat: ctx.lat, lon: ctx.lon, radius_miles: 2, heights_ft: [towerHeightFt], force_refresh: true })
          .then((r) => {
            const d = r.data || {};
            return { airport: d.airport || null, tower: d.tower || null, rf: d.rf || null, error: null };
          })
          .catch((e) => ({ error: e.message })),
        cloudRFCoverage({ lat: ctx.lat, lon: ctx.lon, height_ft: towerHeightFt, radius_mi: Math.max(ringRadius, 5), site_name: current.site_name || "Site", carrier: "verizon" })
          .then((r) => {
            const d = r.data || {};
            return d.png_url ? { png_url: d.png_url, bounds: d.bounds, key_data: d.key_data, area_covered_sq_km: d.area_covered_sq_km ?? null, max_range_km: d.max_range_km ?? null } : { error: d.error || "No coverage" };
          })
          .catch((e) => ({ error: e.message })),
      ]);

      const rfPatch = { ...(current.rf_enrichment || {}) };
      rfPatch[slotKey] = {
        target_index: ctx.target_index, target_lat: ctx.lat, target_lon: ctx.lon,
        radius_miles: ringRadius, tower_height_ft: towerHeightFt,
        generated_at: new Date().toISOString(),
        rf: rfRes, coverage: covRes,
      };
      await updateRecord({ rf_enrichment: rfPatch });
      addLog("RF Proximity & Coverage", rfRes.error && covRes.error ? "warn" : "done");
    } catch (e) {
      addLog(`RF & Coverage failed: ${e.message}`, "warn");
    }

    // 4. Power & Airport (optional)
    try {
      addLog("Power & Airport maps…", "running");
      const res = await scipPowerAirportMaps({
        lat: ctx.lat, lon: ctx.lon,
        radius_miles: Number(current.search_radius) || 1.0,
        state: (current.state || "").toUpperCase(),
      });
      const payload = { power: res.data?.power || null, airport: res.data?.airport || null };
      if (payload.power || payload.airport) {
        await updateRecord({ power_airport_maps: payload, ...stampPatch(current, SECTION_KEYS.power_airport) });
        addLog("Power & Airport maps", "done");
      } else {
        addLog("Power & Airport maps — no data returned", "warn");
      }
    } catch (e) {
      addLog(`Power & Airport failed: ${e.message}`, "warn");
    }

    // 5. Existing Conditions (optional)
    try {
      addLog("Existing Conditions…", "running");
      const res = await scipExistingConditions({
        lat: ctx.lat, lon: ctx.lon,
        parcel_address: ctx.parcel_address || "",
        county: current.county || "",
        state: current.state || "",
      });
      const conditions = res.data?.conditions;
      if (conditions) {
        await updateRecord({ existing_conditions: conditions, ...stampPatch(current, SECTION_KEYS.existing_conditions) });
        addLog("Existing Conditions", "done");
      } else {
        addLog("Existing Conditions — no data returned", "warn");
      }
    } catch (e) {
      addLog(`Existing Conditions failed: ${e.message}`, "warn");
    }

    setDone(true);
    setRunning(false);
    toast.success(`SCIP generated for ${ctx.target_label}`);
  }

  // Icon per log status
  function StatusIcon({ status }) {
    if (status === "running") return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />;
    if (status === "done") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
    if (status === "warn") return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    if (status === "error") return <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    return null;
  }

  return (
    <div className="bg-white rounded-lg border p-5" style={{ borderColor: SKYWAVE.blue }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div>
          <h3 className="font-bold text-lg" style={{ color: SKYWAVE.navy }}>Run Full SCIP</h3>
          <p className="text-xs mt-0.5" style={{ color: SKYWAVE.muted }}>
            Runs all sections (Zoning & Permitting, HAWK MAPS, RF & Coverage, Power & Airport, Existing Conditions) in sequence for{" "}
            <strong>{ctx.target_label}</strong>. Requires parcel targets to be selected first.
          </p>
        </div>
        <Button
          disabled={running}
          onClick={() => run(false)}
          className="inline-flex items-center gap-1.5 text-white font-semibold disabled:opacity-50"
          style={{ background: hasTargets ? SKYWAVE.blue : SKYWAVE.muted }}
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {running ? "Running SCIP…" : "Run Full SCIP"}
        </Button>
      </div>

      {/* Guard: no targets yet */}
      {!hasTargets && !running && (
        <div className="flex items-start gap-2 text-sm rounded-lg p-3 mb-3" style={{ background: "#FEF3C7", color: "#92400E" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong>3 parcel targets must be selected before running the full SCIP.</strong>
            <p className="mt-0.5">Run <em>Find 3 Best Parcels</em> in Section 1 above, then return here.
            {ctx.is_legacy_fallback && (
              <button
                onClick={() => run(true)}
                className="ml-2 underline font-semibold"
                style={{ color: "#92400E" }}
              >
                Run legacy centroid-only SCIP anyway
              </button>
            )}
            </p>
          </div>
        </div>
      )}

      {/* Active target indicator */}
      {hasTargets && !running && !done && (
        <div className="text-xs rounded-lg p-2 mb-2" style={{ background: "rgba(27,63,174,0.06)", color: SKYWAVE.navy }}>
          Active target: <strong>{ctx.target_label}</strong>
          {ctx.warnings?.length > 0 && (
            <span className="ml-2 text-amber-700">⚠ {ctx.warnings[0]}</span>
          )}
        </div>
      )}

      {/* Run log */}
      {log.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {log.map((entry, i) => (
            <div key={i} className="flex items-center gap-2 text-xs" style={{ color: SKYWAVE.ink }}>
              <StatusIcon status={entry.status} />
              <span className={entry.status === "error" ? "text-red-600" : entry.status === "warn" ? "text-amber-700" : ""}>{entry.label}</span>
            </div>
          ))}
        </div>
      )}

      {done && (
        <div className="mt-3 flex items-center gap-2 text-sm font-semibold" style={{ color: "#065F46" }}>
          <CheckCircle2 className="w-4 h-4" />
          SCIP generated for {ctx.target_label}
        </div>
      )}
    </div>
  );
}