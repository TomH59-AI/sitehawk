/**
 * Section4MapSuite — SiteHawk pipeline step 4 ("HAWK TARGET A MAP SUITE").
 *
 * Six maps, generated ONE AT A TIME, each by its own button. EVERY map renders
 * for TARGET A ONLY (never Target B/C). Strict gating:
 *  - LOCKED until Section 3 (Targets) is complete AND Target A is resolved.
 *  - pipelineStep enters "maps"; six sub-steps fire in sequence, each ONLY on
 *    its own button click: aerial → topo → fema → zoning → wetlands → parcel.
 *  - Each sub-step is locked until the prior one completes.
 *  - While in flight: hawk flying-in-place spinner only. No auto-advance.
 *  - Each panel has a Regenerate button.
 *
 * Reuses the SAME working API integrations the old auto-firing SCIP map
 * components used (Mapbox satellite, USGS contours, FEMA NFHL, Zoneomics,
 * USFWS NWI, Realie) — now rewired under gated buttons in lib/section4Maps.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Lock, Layers } from "lucide-react";
import { toast } from "sonner";
import MapSubStep from "./section4/MapSubStep";
import { loadPublicConfig } from "@/lib/publicConfig";
import { realieParcelsInRing } from "@/functions/realieParcelsInRing";
import { femaFloodLookup } from "@/functions/femaFloodLookup";
import {
  ensureMapboxLoaded, renderAerial, renderTopo, renderFema,
  renderZoning, renderWetlands, renderParcel, BRAND_GREEN,
} from "@/lib/section4Maps";

const STEPS = ["aerial", "topo", "fema", "zoning", "wetlands", "parcel"];

export default function Section4MapSuite({
  unlocked, active, targetA, srcLat, srcLon, radiusMiles = 0.5, onRun,
}) {
  // Which sub-steps have completed. Aerial is the only one initially unlocked.
  const [completed, setCompleted] = useState({});
  const [loadingStep, setLoadingStep] = useState(null);
  const [floodZone, setFloodZone] = useState(null);

  const refs = {
    aerial: useRef(null), topo: useRef(null), fema: useRef(null),
    zoning: useRef(null), wetlands: useRef(null), parcel: useRef(null),
  };
  const maps = useRef({});

  useEffect(() => {
    return () => {
      Object.values(maps.current).forEach((m) => m?.remove?.());
      maps.current = {};
    };
  }, []);

  const runStep = useCallback(async (step) => {
    if (!targetA || !Number.isFinite(targetA.latitude) || !Number.isFinite(targetA.longitude)) {
      toast.error("Target A coordinates not resolved — re-run Section 3.");
      return;
    }
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
      if (step === "aerial") {
        map = await renderAerial(refs.aerial.current, targetA, srcLat, srcLon, radiusMiles, token);
      } else if (step === "topo") {
        map = await renderTopo(refs.topo.current, targetA, token);
      } else if (step === "fema") {
        const [m, fres] = await Promise.all([
          renderFema(refs.fema.current, targetA, token),
          femaFloodLookup({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null),
        ]);
        map = m;
        setFloodZone(fres?.data?.fema_zone || fres?.data?.fema_risk_factor || null);
      } else if (step === "zoning") {
        map = await renderZoning(refs.zoning.current, targetA, token, cfg.zoneomicsApiKey);
      } else if (step === "wetlands") {
        map = await renderWetlands(refs.wetlands.current, targetA, token);
      } else if (step === "parcel") {
        const pres = await realieParcelsInRing({
          lat: targetA.latitude, lon: targetA.longitude, radius_miles: 0.5,
        }).catch(() => null);
        const parcels = pres?.data?.parcels || [];
        map = await renderParcel(refs.parcel.current, targetA, parcels, token);
      }

      maps.current[step] = map;
      setCompleted((prev) => ({ ...prev, [step]: true }));
      toast.success(`${step.charAt(0).toUpperCase() + step.slice(1)} map generated for Target A.`);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || `${step} map failed.`);
    } finally {
      setLoadingStep(null);
    }
  }, [targetA, srcLat, srcLon, radiusMiles, refs]);

  // The Aerial button also arms the section (pipelineStep → "maps").
  const beginAndRun = (step) => {
    if (!active && step === "aerial") onRun?.();
    runStep(step);
  };

  // A sub-step is unlocked once the previous one is complete (aerial = first).
  const isUnlocked = (step) => {
    const i = STEPS.indexOf(step);
    if (i === 0) return true;
    return !!completed[STEPS[i - 1]];
  };

  // ── LOCKED — Section 3 not complete / no Target A yet ──
  if (!unlocked) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 pointer-events-none select-none">
        <div className="px-4 py-3 flex items-center gap-2 text-white/80" style={{ background: "#3f5a54" }}>
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">SCIP · SECTION 4 · LOCKED</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Target A Map Suite</h2>
          </div>
        </div>
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Complete Section 3 (select Target A as the lead site candidate) to unlock the Target A map suite.
        </div>
      </div>
    );
  }

  const ownerLabel = targetA?.owner || targetA?.parcel_address || "";

  const banners = {
    aerial: null,
    topo: null,
    fema: floodZone ? (
      <div className="px-4 py-2 bg-sky-50 dark:bg-sky-950/20 border-y border-sky-300/50 text-sm font-semibold text-sky-800 dark:text-sky-200">
        FEMA Flood Zone at Target A centroid: <span className="font-mono">{floodZone}</span>
      </div>
    ) : null,
    zoning: targetA?.zoning_classification ? (
      <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/20 border-y border-emerald-300/50 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
        Target A zoning classification: <span className="font-mono">{targetA.zoning_classification}</span>
      </div>
    ) : null,
    wetlands: null,
    parcel: null,
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Section banner */}
      <div className="px-4 py-3 flex items-center gap-2 text-white" style={{ background: BRAND_GREEN }}>
        <Layers className="w-5 h-5" />
        <div>
          <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · SECTION 4 · MAP SUITE</div>
          <h2 className="font-heading font-bold text-lg leading-tight">Hawk Target A Map Suite</h2>
          <div className="text-[11px] font-mono opacity-90 mt-0.5">
            Maps generated for Target A only{ownerLabel ? ` · ${ownerLabel}` : ""}
          </div>
        </div>
      </div>

      {/* Idle — armed, waiting for the first Run click */}
      {!active && (
        <div className="px-4 pt-6 text-sm text-muted-foreground">
          Generate six Target A maps one at a time — Aerial, Topography, FEMA Floodplain, Zoning, Wetlands, Parcel.
          Click <span className="font-semibold text-foreground">Run Aerial Map</span> below to begin.
        </div>
      )}

      <div className="p-4 space-y-4">
        <MapSubStep
          index={1} title="Aerial Map" runLabel="Run Aerial Map"
          spinnerLabel="Generating Target A aerial map…"
          unlocked={isUnlocked("aerial")}
          loading={loadingStep === "aerial"} done={!!completed.aerial}
          onRun={() => beginAndRun("aerial")} mapRef={refs.aerial} banner={banners.aerial}
        />
        <MapSubStep
          index={2} title="Topography Map" runLabel="Run Topography Map"
          spinnerLabel="Generating Target A topography map…"
          unlocked={active && isUnlocked("topo")}
          loading={loadingStep === "topo"} done={!!completed.topo}
          onRun={() => runStep("topo")} mapRef={refs.topo} banner={banners.topo}
        />
        <MapSubStep
          index={3} title="Floodplain (FEMA) Map" runLabel="Run FEMA Map"
          spinnerLabel="Generating Target A FEMA floodplain map…"
          unlocked={active && isUnlocked("fema")}
          loading={loadingStep === "fema"} done={!!completed.fema}
          onRun={() => runStep("fema")} mapRef={refs.fema} banner={banners.fema}
        />
        <MapSubStep
          index={4} title="Zoning Map" runLabel="Run Zoning Map"
          spinnerLabel="Generating Target A zoning map…"
          unlocked={active && isUnlocked("zoning")}
          loading={loadingStep === "zoning"} done={!!completed.zoning}
          onRun={() => runStep("zoning")} mapRef={refs.zoning} banner={banners.zoning}
        />
        <MapSubStep
          index={5} title="Wetlands Map" runLabel="Run Wetlands Map"
          spinnerLabel="Generating Target A wetlands map…"
          unlocked={active && isUnlocked("wetlands")}
          loading={loadingStep === "wetlands"} done={!!completed.wetlands}
          onRun={() => runStep("wetlands")} mapRef={refs.wetlands} banner={banners.wetlands}
        />
        <MapSubStep
          index={6} title="Parcel Map" runLabel="Run Parcel Map"
          spinnerLabel="Generating Target A parcel map…"
          unlocked={active && isUnlocked("parcel")}
          loading={loadingStep === "parcel"} done={!!completed.parcel}
          onRun={() => runStep("parcel")} mapRef={refs.parcel} banner={banners.parcel}
        />
      </div>
    </div>
  );
}