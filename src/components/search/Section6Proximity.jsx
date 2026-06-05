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
import StaticImageSanityCheck from "./section6/StaticImageSanityCheck";
import SectionClearButton from "./SectionClearButton";
import { loadPublicConfig } from "@/lib/publicConfig";
import { windSpeedLookup } from "@/functions/windSpeedLookup";
import {
  buildWindMap, BRAND_GREEN,
} from "@/lib/section6Proximity";

const STEPS = ["wind"];

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

      if (step === "wind") {
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
      toast.success(`${step.charAt(0).toUpperCase() + step.slice(1)} map generated for Target A.`);
    } catch (err) {
      console.error(`${tag} threw:`, err?.message);
      toast.error(err?.message || `${step} map failed.`);
      setErrors((p) => ({ ...p, [step]: err?.message || "Unknown error" }));
    } finally {
      clearTimeout(watchdog);
      setLoadingStep(null);
    }
  }, [targetA]);

  // The Wind button also arms the section (pipelineStep → "proximity").
  const beginAndRun = (step) => {
    if (!active && step === "wind") onRun?.();
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
              Wind exposure{ownerLabel ? ` · ${ownerLabel}` : ""}
            </div>
          </div>
        </div>
        {active && onClear && <SectionClearButton onClear={onClear} />}
      </div>

      {/* Idle — armed, waiting for the first Run click */}
      {!active && (
        <div className="px-4 pt-6 text-sm text-muted-foreground">
          Generate the Target A Wind Speed map.
          Click <span className="font-semibold text-foreground">Run Wind Speed Map</span> below to begin.
        </div>
      )}

      <div className="p-4 space-y-4">
        <StaticImageSanityCheck />
        <ProximitySubStep
          index={1} title="Wind Speed Map" runLabel="Run Wind Speed Map"
          spinnerLabel="Generating Target A wind speed map…"
          legend="ASCE 7-22 Wind Speed Zones"
          unlocked={isUnlocked("wind")}
          loading={loadingStep === "wind"} done={!!completed.wind}
          error={errors.wind}
          onRun={() => beginAndRun("wind")} imgUrl={imgByStep.wind} banner={windBanner}
        />
      </div>
    </div>
  );
}