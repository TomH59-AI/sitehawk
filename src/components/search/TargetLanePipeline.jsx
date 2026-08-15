import { useState, useEffect } from "react";
import Section4MapSuite from "./Section4MapSuite";
import Section8Propagation from "./Section8Propagation";
import { wetlandsLookup } from "@/functions/wetlandsLookup";
import { historicSitesLookup } from "@/functions/historicSitesLookup";
import { usfwsSpeciesLookup } from "@/functions/usfwsSpeciesLookup";
import { epaHazWasteLookup } from "@/functions/epaHazWasteLookup";
import { tribalLandLookup } from "@/functions/tribalLandLookup";
import { runQuietLookups } from "@/lib/quietLookup";
import LocalAuthoritiesTable from "@/components/scip/LocalAuthoritiesTable";

/**
 * TargetLanePipeline — a COMPLETELY ISOLATED full-pipeline run for one target
 * (B or C). Owns its own data bus, step state, and section instances, so
 * nothing here can read from or write to Target A's pipeline (or the other
 * lane). Exports/prints inside come from this lane's own section instances,
 * so outputs are per-target by construction. Additive only — Target A's flow,
 * SCIP generation, and Skip-Trace are untouched.
 */
export default function TargetLanePipeline({
  laneLabel,     // "B" | "C"
  target,        // full target object for this lane (never the shared lead)
  zoningResult,  // jurisdiction-wide zoning (read-only input)
  srcLat, srcLon, radiusMiles, ringName, towerHeightFt,
}) {
  const [step, setStep] = useState(null); // null → "maps" → "tower_siter"
  const [mapsComplete, setMapsComplete] = useState(false);
  const [clearKeys, setClearKeys] = useState({ maps: 0, propagation: 0 });
  // Lane-private data bus — mirrors the main pipeline's bus, isolated per lane.
  const [sectionData, setSectionData] = useState({});
  const merge = (d) => setSectionData((prev) => ({ ...prev, ...d }));

  const laneColor = laneLabel === "B" ? "#d97706" : "#7c3aed";
  const laneBg = laneLabel === "B" ? "bg-amber-500/10" : "bg-violet-500/10";

  // Same quiet score/compliance lookups the main pipeline fires for Target A,
  // run for THIS lane's target and merged into THIS lane's private bus only.
  useEffect(() => {
    const lat = target?.latitude, lon = target?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const cancel = runQuietLookups(
      [
        ["wetlands", () => wetlandsLookup({ lat, lon })],
        ["historic", () => historicSitesLookup({ lat, lon })],
        ["species", () => usfwsSpeciesLookup({ lat, lon })],
        ["hazwaste", () => epaHazWasteLookup({ lat, lon })],
        ["tribal", () => tribalLandLookup({ lat, lon })],
      ],
      (name, d) => {
        if (name === "wetlands") merge({ wetlands: { present: !!d.wetlands_present, type: d.wetland_type || (d.wetland_types?.[0] ?? null) } });
        else if (name === "historic") merge({ historic: { present: !!d.historic_present, count: d.historic_count || 0, site_names: d.site_names || [] } });
        else if (name === "species") merge({ species: { present: !!d.species_present, count: d.species_count || 0, names: d.species_names || [] } });
        else if (name === "hazwaste") merge({ hazwaste: { present: !!d.hazwaste_present, count: d.hazwaste_count || 0, npl_count: d.npl_count || 0, site_names: d.site_names || [] } });
        else if (name === "tribal") merge({ tribal: { present: !!d.tribal_present, on_site: !!d.on_site, proximity: d.proximity || null, names: d.names || [] } });
      }
    );
    return cancel;
  }, [target?.latitude, target?.longitude]);

  if (!target) return null;

  return (
    <div className="rounded-2xl border-2 p-3 md:p-4 space-y-4" style={{ borderColor: laneColor }}>
      {/* Lane banner — always shows WHICH target this pipeline belongs to */}
      <div className={`rounded-xl px-4 py-3 ${laneBg}`} style={{ borderLeft: `4px solid ${laneColor}` }}>
        <div className="text-[10px] font-mono tracking-[0.3em]" style={{ color: laneColor }}>
          INDEPENDENT PIPELINE · TARGET {laneLabel}
        </div>
        <div className="font-heading font-bold text-foreground">
          Target {laneLabel} — {target.parcel_address || target.apn || "parcel"}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          APN {target.apn || "—"} · {target.acreage ? `${target.acreage} ac` : "—"}
          {target.zoning_classification ? ` · ${target.zoning_classification}` : ""} · Fully isolated from Target A{laneLabel === "B" ? " and C" : " and B"} — separate maps, siting, and exports.
        </div>
      </div>

      {/* Map Suite (incl. compliance + deed substeps) — lane-private instance */}
      <Section4MapSuite
        key={`lane-${laneLabel}-maps-${clearKeys.maps}`}
        unlocked={true}
        active={step === "maps" || step === "tower_siter"}
        onClear={() => { setClearKeys((p) => ({ ...p, maps: p.maps + 1 })); setMapsComplete(false); setSectionData({}); setStep(null); }}
        targetA={target}
        srcLat={srcLat}
        srcLon={srcLon}
        radiusMiles={radiusMiles}
        ringName={`${ringName} — Target ${laneLabel}`}
        towerHeightFt={towerHeightFt}
        sectionData={sectionData}
        onRun={() => setStep("maps")}
        onComplete={() => setMapsComplete(true)}
        onData={merge}
      />

      {/* RF Propagation — lane-private instance */}
      <Section8Propagation
        key={`lane-${laneLabel}-prop-${clearKeys.propagation}`}
        unlocked={true}
        onClear={() => setClearKeys((p) => ({ ...p, propagation: p.propagation + 1 }))}
        targetA={target}
        towerHeightFt={towerHeightFt}
        onData={merge}
      />

      {/* Tower Siter retired — TalonFIT™ is the sole siting engine. */}

      {/* Local Governing Authorities & Area Profile for THIS lane's target —
          cached per county+state, so it reuses the main pipeline's lookup. */}
      <LocalAuthoritiesTable lat={target.latitude} lng={target.longitude} />
    </div>
  );
}