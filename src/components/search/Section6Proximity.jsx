/**
 * Section6Proximity — SiteHawk pipeline step 6 ("HAWK PROXIMITY & ENVIRONMENT
 * VISION"). Three maps, generated ONE AT A TIME, each by its own button. EVERY
 * map renders for TARGET A ONLY. Strict gating:
 *  - LOCKED until Section 4 (Target A map suite) is complete AND Target A is resolved.
 *  - pipelineStep enters "proximity"; three sub-steps fire in sequence, each ONLY
 *    on its own button click: airport → celltower → wind.
 *  - Each sub-step is locked until the prior one completes.
 *  - While in flight: hawk flying-in-place spinner only. No auto-advance.
 *  - Each panel has a Regenerate button.
 *
 * Reuses the EXISTING working backend integrations (no legacy proximity/wind
 * code fires from outside this section):
 *   - nearestAirportFromDirectory (FAA "Airports" dataset)
 *   - cellTowerLookup (FCC ASR + OpenCellID merge, already deduped)
 *   - windSpeedLookup (ASCE 7-22, preserved as-is)
 */

import { useState, useEffect, useCallback } from "react";
import { Lock, Compass } from "lucide-react";
import { toast } from "sonner";
import ProximitySubStep from "./section6/ProximitySubStep";
import SectionClearButton from "./SectionClearButton";
import { loadPublicConfig } from "@/lib/publicConfig";
import { nearestAirportFromDirectory } from "@/functions/nearestAirportFromDirectory";
import { cellTowerLookup } from "@/functions/cellTowerLookup";
import { windSpeedLookup } from "@/functions/windSpeedLookup";
import {
  buildAirportMap, buildCellTowerMap, buildWindMap, BRAND_GREEN,
} from "@/lib/section6Proximity";

const STEPS = ["airport", "celltower", "wind"];

export default function Section6Proximity({
  unlocked, active, targetA, onRun, onComplete, onData, onClear,
}) {
  const [completed, setCompleted] = useState({});
  const [loadingStep, setLoadingStep] = useState(null);
  const [windInfo, setWindInfo] = useState(null);
  const [errors, setErrors] = useState({});
  // Per-step destination metadata for the glass info panel (airport / celltower).
  const [infoByStep, setInfoByStep] = useState({});
  // Per-step Static Images API URL — dropped straight into an <img/>. No WebGL.
  const [imgByStep, setImgByStep] = useState({});

  // Fire onComplete once all three maps are done — unlocks Section 7.
  useEffect(() => {
    if (STEPS.every((s) => completed[s])) onComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  const runStep = useCallback(async (step) => {
    const tag = `[PROXIMITY DIAG ${step}]`;
    console.log(`${tag} Run handler fired — Target A:`, targetA?.latitude ?? null, targetA?.longitude ?? null, "APN:", targetA?.apn ?? null);
    if (!targetA || !Number.isFinite(Number(targetA.latitude)) || !Number.isFinite(Number(targetA.longitude))) {
      console.error(`${tag} Target A coordinates null/invalid — aborting.`);
      toast.error("Target A coordinates not resolved — re-run Section 3.");
      setErrors((p) => ({ ...p, [step]: "Target A coordinates not resolved — re-run Section 3." }));
      return;
    }
    const lat = Number(targetA.latitude);
    const lon = Number(targetA.longitude);
    setErrors((p) => ({ ...p, [step]: null }));
    setLoadingStep(step);

    // 15s per-step watchdog — never spin forever.
    const watchdog = setTimeout(() => {
      setLoadingStep((cur) => {
        if (cur === step) {
          console.error(`${tag} Timed out after 15s.`);
          setErrors((p) => ({ ...p, [step]: "Timed out after 15s — data source did not respond." }));
          return null;
        }
        return cur;
      });
    }, 15000);

    try {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      console.log(`${tag} Mapbox token (first 8):`, token ? String(token).slice(0, 8) : "NULL");
      if (!token) {
        toast.error("Mapbox token unavailable.");
        setErrors((p) => ({ ...p, [step]: "Mapbox token unavailable." }));
        clearTimeout(watchdog); setLoadingStep(null); return;
      }

      if (step === "airport") {
        const res = await nearestAirportFromDirectory({ lat, lon });
        const airport = res.data?.match;
        console.log(`${tag} nearestAirportFromDirectory →`, airport ? `${airport.callnumber} ${airport.distance_miles}mi (${res.data?.candidates_scanned} scanned)` : "no match");
        if (!airport) throw new Error("No airport found near Target A.");
        const { url } = buildAirportMap(targetA, airport, token);
        setImgByStep((p) => ({ ...p, airport: url }));
        // Emit airport factor to the bus.
        onData?.({ airport: { name: airport.name || airport.callnumber || null, distance_miles: Number(airport.distance_miles), type: airport.type || null } });
        setInfoByStep((p) => ({
          ...p,
          airport: {
            kicker: "NEAREST AIRPORT",
            title: airport.callnumber || airport.name || "Airport",
            distMi: Number(airport.distance_miles),
            rows: [
              { label: "Name", value: airport.name },
              { label: "Type", value: airport.type ? String(airport.type).replace(/_/g, " ") : null },
              { label: "Coords", value: `${Number(airport.latitude).toFixed(5)}, ${Number(airport.longitude).toFixed(5)}` },
            ],
          },
        }));
      } else if (step === "celltower") {
        const res = await cellTowerLookup({ lat, lon, radius_miles: 10 });
        const tower = res.data?.nearest_tower;
        console.log(`${tag} cellTowerLookup →`, tower ? `${tower.licensee || "?"} ASR#${tower.tower_registration_number || "—"} ${tower.distance_miles}mi src=${tower.source || "FCC"}` : "no tower");
        if (!tower || tower.latitude_deg == null) throw new Error("No cell tower found near Target A.");
        const { url } = buildCellTowerMap(targetA, tower, token);
        setImgByStep((p) => ({ ...p, celltower: url }));
        // Emit tower factor to the bus — source-labeled (ASR+OpenCellID @10mi, canonical).
        onData?.({ tower: { owner: tower.licensee || null, distance_miles: Number(tower.distance_miles), height_ft: tower.overall_height_ft != null ? Number(tower.overall_height_ft) : null, source: tower.tower_registration_number ? "FCC ASR" : (tower.source || "OpenCellID") } });
        const asrn = tower.tower_registration_number ? `ASR #${tower.tower_registration_number}` : (tower.source || "OpenCellID");
        setInfoByStep((p) => ({
          ...p,
          celltower: {
            kicker: "NEAREST CELL TOWER",
            title: tower.licensee || "Operator —",
            distMi: Number(tower.distance_miles),
            rows: [
              { label: "Registration", value: asrn },
              { label: "Structure", value: tower.structure_type },
              { label: "Height", value: tower.overall_height_ft != null ? `${tower.overall_height_ft} ft` : null },
              { label: "Coords", value: `${Number(tower.latitude_deg).toFixed(5)}, ${Number(tower.longitude_deg).toFixed(5)}` },
            ],
          },
        }));
      } else if (step === "wind") {
        const windRes = await windSpeedLookup({ lat, lon }).catch(() => null);
        console.log(`${tag} windSpeedLookup →`, windRes?.data?.wind_speed_mph ?? "no value", "mph");
        const { url } = buildWindMap(targetA, token);
        setImgByStep((p) => ({ ...p, wind: url }));
        setWindInfo(windRes?.data || null);
        // Emit wind factor to the bus.
        onData?.({ wind: { wind_speed_mph: windRes?.data?.wind_speed_mph ?? null, risk_level: windRes?.data?.wind_risk_level ?? null } });
      }

      setCompleted((prev) => ({ ...prev, [step]: true }));
      console.log(`${tag} Map generated OK.`);
      toast.success(`${step === "celltower" ? "Cell tower" : step.charAt(0).toUpperCase() + step.slice(1)} map generated for Target A.`);
    } catch (err) {
      console.error(`${tag} threw:`, err?.message);
      toast.error(err?.message || `${step} map failed.`);
      setErrors((p) => ({ ...p, [step]: err?.message || "Unknown error" }));
    } finally {
      clearTimeout(watchdog);
      setLoadingStep(null);
    }
  }, [targetA]);

  // The Airport button also arms the section (pipelineStep → "proximity").
  const beginAndRun = (step) => {
    if (!active && step === "airport") onRun?.();
    runStep(step);
  };

  const isUnlocked = (step) => {
    const i = STEPS.indexOf(step);
    if (i === 0) return true;
    return !!completed[STEPS[i - 1]];
  };

  // ── LOCKED — Section 4 not complete / no Target A ──
  if (!unlocked) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 pointer-events-none select-none">
        <div className="px-4 py-3 flex items-center gap-2 text-white/80" style={{ background: "#3f5a54" }}>
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">SCIP · SECTION 6 · LOCKED</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Proximity & Environment Vision — Target A</h2>
          </div>
        </div>
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Complete all seven maps in Section 4 to unlock the Target A proximity & environment maps.
        </div>
      </div>
    );
  }

  const ownerLabel = targetA?.owner || targetA?.parcel_address || "";
  const windMph = windInfo?.wind_speed_mph;

  const windBanner = windMph ? (
    <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-y border-amber-300/50 text-sm font-semibold text-amber-800 dark:text-amber-200">
      ASCE 7-22 design wind speed at Target A: <span className="font-mono">{windMph} mph</span>
      {windInfo?.wind_risk_level ? ` · ${windInfo.wind_risk_level} risk` : ""}
      {windInfo?.in_hurricane_prone_region ? " · Hurricane-Prone Region" : ""}
    </div>
  ) : null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Section banner */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 text-white" style={{ background: BRAND_GREEN }}>
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · SECTION 6 · PROXIMITY & ENVIRONMENT</div>
            <h2 className="font-heading font-bold text-lg leading-tight">HAWK PROXIMITY &amp; ENVIRONMENT VISION — TARGET A</h2>
            <div className="text-[11px] font-mono opacity-90 mt-0.5">
              Nearest airport · nearest tower · wind exposure{ownerLabel ? ` · ${ownerLabel}` : ""}
            </div>
          </div>
        </div>
        {active && onClear && <SectionClearButton onClear={onClear} />}
      </div>

      {/* Idle — armed, waiting for the first Run click */}
      {!active && (
        <div className="px-4 pt-6 text-sm text-muted-foreground">
          Generate three Target A maps one at a time — Closest Airport, Closest Cell Tower, Wind Speed.
          Click <span className="font-semibold text-foreground">Run Closest Airport Map</span> below to begin.
        </div>
      )}

      <div className="p-4 space-y-4">
        <ProximitySubStep
          index={1} title="Closest Airport Map" runLabel="Run Closest Airport Map"
          spinnerLabel="Finding nearest airport to Target A…"
          legend="Target A → Nearest Airport"
          unlocked={isUnlocked("airport")}
          loading={loadingStep === "airport"} done={!!completed.airport}
          error={errors.airport} info={infoByStep.airport}
          onRun={() => beginAndRun("airport")} imgUrl={imgByStep.airport}
        />
        <ProximitySubStep
          index={2} title="Closest Cell Tower Map" runLabel="Run Closest Cell Tower Map"
          spinnerLabel="Finding nearest existing tower to Target A…"
          legend="Target A → Nearest Existing Tower"
          unlocked={active && isUnlocked("celltower")}
          loading={loadingStep === "celltower"} done={!!completed.celltower}
          error={errors.celltower} info={infoByStep.celltower}
          onRun={() => runStep("celltower")} imgUrl={imgByStep.celltower}
        />
        <ProximitySubStep
          index={3} title="Wind Speed Map" runLabel="Run Wind Speed Map"
          spinnerLabel="Generating Target A wind speed map…"
          legend="ASCE 7-22 Wind Speed Zones"
          unlocked={active && isUnlocked("wind")}
          loading={loadingStep === "wind"} done={!!completed.wind}
          error={errors.wind}
          onRun={() => runStep("wind")} imgUrl={imgByStep.wind} banner={windBanner}
        />
      </div>
    </div>
  );
}