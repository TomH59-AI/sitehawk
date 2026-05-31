/**
 * Section6Proximity — SiteHawk pipeline step 6 ("HAWK PROXIMITY & ENVIRONMENT
 * VISION"). Three maps, generated ONE AT A TIME, each by its own button. EVERY
 * map renders for TARGET A ONLY. Strict gating:
 *  - LOCKED until Section 5 (all four viewsheds) is complete AND Target A is resolved.
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

import { useState, useRef, useEffect, useCallback } from "react";
import { Lock, Compass } from "lucide-react";
import { toast } from "sonner";
import ProximitySubStep from "./section6/ProximitySubStep";
import { loadPublicConfig } from "@/lib/publicConfig";
import { nearestAirportFromDirectory } from "@/functions/nearestAirportFromDirectory";
import { cellTowerLookup } from "@/functions/cellTowerLookup";
import { windSpeedLookup } from "@/functions/windSpeedLookup";
import {
  ensureMapboxLoaded, renderAirport, renderCellTower, renderWind, BRAND_GREEN,
} from "@/lib/section6Proximity";

const STEPS = ["airport", "celltower", "wind"];

export default function Section6Proximity({
  unlocked, active, targetA, onRun, onComplete,
}) {
  const [completed, setCompleted] = useState({});
  const [loadingStep, setLoadingStep] = useState(null);
  const [windInfo, setWindInfo] = useState(null);

  // Fire onComplete once all three maps are done — unlocks Section 7.
  useEffect(() => {
    if (STEPS.every((s) => completed[s])) onComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  const refs = {
    airport: useRef(null), celltower: useRef(null), wind: useRef(null),
  };
  const maps = useRef({});

  useEffect(() => {
    return () => {
      Object.values(maps.current).forEach((m) => m?.remove?.());
      maps.current = {};
    };
  }, []);

  const runStep = useCallback(async (step) => {
    if (!targetA || !Number.isFinite(Number(targetA.latitude)) || !Number.isFinite(Number(targetA.longitude))) {
      toast.error("Target A coordinates not resolved — re-run Section 3.");
      return;
    }
    const lat = Number(targetA.latitude);
    const lon = Number(targetA.longitude);
    setLoadingStep(step);
    try {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      if (!token) { toast.error("Mapbox token unavailable."); setLoadingStep(null); return; }
      await ensureMapboxLoaded();

      // Dispose any prior instance for this step before re-rendering.
      maps.current[step]?.remove?.();
      maps.current[step] = null;
      await new Promise((r) => requestAnimationFrame(r));

      let map;
      if (step === "airport") {
        const res = await nearestAirportFromDirectory({ lat, lon });
        const airport = res.data?.match;
        if (!airport) throw new Error("No airport found near Target A.");
        map = await renderAirport(refs.airport.current, targetA, airport, token);
      } else if (step === "celltower") {
        const res = await cellTowerLookup({ lat, lon, radius_miles: 10 });
        const tower = res.data?.nearest_tower;
        if (!tower || tower.latitude_deg == null) throw new Error("No cell tower found near Target A.");
        map = await renderCellTower(refs.celltower.current, targetA, tower, token);
      } else if (step === "wind") {
        const [windRes, m] = await Promise.all([
          windSpeedLookup({ lat, lon }).catch(() => null),
          renderWind(refs.wind.current, targetA, token),
        ]);
        setWindInfo(windRes?.data || null);
        map = m;
      }

      maps.current[step] = map;
      setCompleted((prev) => ({ ...prev, [step]: true }));
      toast.success(`${step === "celltower" ? "Cell tower" : step.charAt(0).toUpperCase() + step.slice(1)} map generated for Target A.`);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || `${step} map failed.`);
    } finally {
      setLoadingStep(null);
    }
  }, [targetA, refs]);

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

  // ── LOCKED — Section 5 not complete / no Target A ──
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
          Complete all four viewsheds in Section 5 to unlock the Target A proximity & environment maps.
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
      <div className="px-4 py-3 flex items-center gap-2 text-white" style={{ background: BRAND_GREEN }}>
        <Compass className="w-5 h-5" />
        <div>
          <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · SECTION 6 · PROXIMITY & ENVIRONMENT</div>
          <h2 className="font-heading font-bold text-lg leading-tight">HAWK PROXIMITY &amp; ENVIRONMENT VISION — TARGET A</h2>
          <div className="text-[11px] font-mono opacity-90 mt-0.5">
            Nearest airport · nearest tower · wind exposure{ownerLabel ? ` · ${ownerLabel}` : ""}
          </div>
        </div>
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
          onRun={() => beginAndRun("airport")} mapRef={refs.airport}
        />
        <ProximitySubStep
          index={2} title="Closest Cell Tower Map" runLabel="Run Closest Cell Tower Map"
          spinnerLabel="Finding nearest existing tower to Target A…"
          legend="Target A → Nearest Existing Tower"
          unlocked={active && isUnlocked("celltower")}
          loading={loadingStep === "celltower"} done={!!completed.celltower}
          onRun={() => runStep("celltower")} mapRef={refs.celltower}
        />
        <ProximitySubStep
          index={3} title="Wind Speed Map" runLabel="Run Wind Speed Map"
          spinnerLabel="Generating Target A wind speed map…"
          legend="ASCE 7-22 Wind Speed Zones"
          unlocked={active && isUnlocked("wind")}
          loading={loadingStep === "wind"} done={!!completed.wind}
          onRun={() => runStep("wind")} mapRef={refs.wind} banner={windBanner}
        />
      </div>
    </div>
  );
}