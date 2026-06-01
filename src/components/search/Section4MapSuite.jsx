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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AERIAL MAP DIAGNOSTIC — 2026-05-31
 * Reported: Aerial Map (SARF ring + Target A) never renders on Run click.
 * Audit findings + patches (AERIAL sub-step ONLY — no other map/section touched):
 *   1. SARF STATE PLUMBING — OK. srcLat/srcLon/radiusMiles + targetA flow
 *      SiteSearch → Section4MapSuite → runStep correctly. Added [AERIAL DIAG]
 *      logs at run entry printing SARF center, radius, Target A lat/lon + APN.
 *   2. CLICK HANDLER — OK. beginAndRun("aerial") fires onRun + runStep. Added
 *      [AERIAL DIAG] log at handler entry.
 *   3. MAPBOX TOKEN — OK. loadPublicConfig().mapboxAccessToken resolves. Now
 *      logs first 8 chars to confirm propagation.
 *   4. CONTAINER HEIGHT — **ROOT CAUSE.** MapSubStep mounted the map <div>
 *      inside display:none until `done`. Mapbox cannot measure a hidden/0×0
 *      container → blank/never-rendered map. PATCHED in MapSubstep: canvas is
 *      now visible & sized (minHeight 500px, width 100%) whenever loading||done.
 *   5. MAP INIT — wrapped renderAerial in try/catch with [AERIAL DIAG] errors;
 *      lib renderers attach the map 'error' event.
 *   6. LOAD EVENT — OK. lib/section4Maps renderAerial already adds ring +
 *      waypoint + tower icon inside map.on("load").
 *   7. SARF RING — buildCircle(srcLat, srcLon, radiusMiles) uses Section 1
 *      values; logged the resulting GeoJSON feature.
 *   8. TARGET A TOWER ICON — small cell-tower SVG marker; falls back to a solid
 *      circle if the SVG element fails (addTowerMarker in lib/section4Maps).
 *   9. RENDER ORDER — satellite base → ring fill/line → center pin → tower icon.
 *  10. ERROR SURFACE — aerial errors now surface inline in MapSubStep with a
 *      Retry button (errors state below). No more silent spinner-forever.
 * ─────────────────────────────────────────────────────────────────────────────
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
  renderZoningGrid, renderWetlands, renderParcel, BRAND_GREEN, buildCircle,
} from "@/lib/section4Maps";
import { buildLegend, swatchColor, normalizeZoneType } from "@/lib/zoningPalette";
import { zoneomicsZoneGrid } from "@/functions/zoneomicsZoneGrid";
import ZoningLegend from "./section4/ZoningLegend";

const STEPS = ["aerial", "topo", "fema", "zoning", "wetlands", "parcel"];

export default function Section4MapSuite({
  unlocked, active, targetA, srcLat, srcLon, radiusMiles = 0.5, onRun, onComplete,
}) {
  // Which sub-steps have completed. Aerial is the only one initially unlocked.
  const [completed, setCompleted] = useState({});
  const [loadingStep, setLoadingStep] = useState(null);
  const [floodZone, setFloodZone] = useState(null);
  const [zoneInfo, setZoneInfo] = useState(null);
  // Zoning legend (color-coded districts) + a fallback notice when no tiles.
  const [zoningLegend, setZoningLegend] = useState([]);
  const [zoningFallback, setZoningFallback] = useState(null);
  // Cache the resolved legend list per Target A coordinate so re-clicks skip the query.
  const zoningCache = useRef({});
  // Per-step error message (currently surfaced for the aerial sub-step).
  const [errors, setErrors] = useState({});

  // Fire onComplete once all six maps are done — unlocks Section 5.
  useEffect(() => {
    if (STEPS.every((s) => completed[s])) onComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

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
    // ── [AERIAL DIAG] handler entry + SARF/Target A state at run time ──
    if (step === "aerial") {
      console.log("[AERIAL DIAG] Run handler fired for Aerial Map");
      console.log("[AERIAL DIAG] SARF center lat/lon:", srcLat ?? null, srcLon ?? null);
      console.log("[AERIAL DIAG] SARF radius:", radiusMiles ?? null);
      console.log("[AERIAL DIAG] Target A lat/lon:", targetA?.latitude ?? null, targetA?.longitude ?? null);
      console.log("[AERIAL DIAG] Target A parcel ID:", targetA?.apn ?? null);
    }
    if (!targetA || !Number.isFinite(targetA.latitude) || !Number.isFinite(targetA.longitude)) {
      if (step === "aerial") console.error("[AERIAL DIAG] Target A coordinates null/invalid — aborting.");
      toast.error("Target A coordinates not resolved — re-run Section 3.");
      if (step === "aerial") setErrors((p) => ({ ...p, aerial: "Target A coordinates not resolved — re-run Section 3." }));
      return;
    }
    setErrors((p) => ({ ...p, [step]: null }));
    setLoadingStep(step);
    try {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      if (step === "aerial") console.log("[AERIAL DIAG] Mapbox token (first 8):", token ? String(token).slice(0, 8) : "NULL");
      if (!token) {
        toast.error("Mapbox token unavailable.");
        if (step === "aerial") setErrors((p) => ({ ...p, aerial: "Mapbox token unavailable." }));
        setLoadingStep(null);
        return;
      }
      await ensureMapboxLoaded();

      // Dispose any prior instance for this step before re-rendering.
      maps.current[step]?.remove?.();
      maps.current[step] = null;
      await new Promise((r) => requestAnimationFrame(r));

      let map;
      if (step === "aerial") {
        const ringFeature = buildCircle(srcLat, srcLon, radiusMiles);
        console.log("[AERIAL DIAG] SARF ring GeoJSON feature:", ringFeature);
        console.log("[AERIAL DIAG] Aerial container mounted:", !!refs.aerial.current);
        map = await renderAerial(refs.aerial.current, targetA, srcLat, srcLon, radiusMiles, token);
        console.log("[AERIAL DIAG] renderAerial resolved — map instance:", !!map);
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
        console.log("[ZONING MAP DIAG] Run Zoning Map — Target A:", targetA?.latitude, targetA?.longitude, "APN:", targetA?.apn);
        const key = `${targetA.latitude.toFixed(6)},${targetA.longitude.toFixed(6)}`;
        const cached = zoningCache.current[key];

        let gridCells, legend, zone, cellLat, cellLng;

        if (cached) {
          ({ gridCells, legend, zone, cellLat, cellLng } = cached);
        } else {
          // Sample a grid of zoneDetail points around Target A — every cell gets
          // its real district straight from the Zoneomics API.
          const gres = await zoneomicsZoneGrid({
            lat: targetA.latitude, lng: targetA.longitude, radius_miles: 0.4, grid: 7,
          }).catch((e) => { console.error("[ZONING MAP DIAG] zoneGrid threw:", e); return null; });

          const gdata = gres?.data ?? gres;
          if (gdata?.error) {
            setLoadingStep(null);
            setErrors((p) => ({ ...p, zoning: gdata.error.includes("API_KEY") ? "Zoneomics auth failed — verify ZONEOMICS_API_KEY" : gdata.error }));
            return;
          }

          const rawCells = gdata?.cells || [];
          const districts = gdata?.districts || [];
          cellLat = gdata?.cell_lat_deg;
          cellLng = gdata?.cell_lng_deg;

          if (!rawCells.length) {
            setLoadingStep(null);
            setErrors((p) => ({ ...p, zoning: "Zoneomics returned no zoning districts for this area." }));
            return;
          }

          // Build the API-derived legend (color per district).
          legend = buildLegend(districts);
          const colorByCode = Object.fromEntries(legend.map((d) => [d.code, d.color]));

          // Attach the legend color to each grid cell.
          gridCells = rawCells.map((c) => ({
            lat: c.lat, lng: c.lng, zone_code: c.zone_code,
            color: colorByCode[c.zone_code] || swatchColor(normalizeZoneType(c.zone_type, c.zone_code), c.zone_code),
          }));

          // Target A's own district = the center cell (closest to Target A).
          const center = rawCells.reduce((best, c) => {
            const d = Math.hypot(c.lat - targetA.latitude, c.lng - targetA.longitude);
            return !best || d < best.d ? { d, c } : best;
          }, null)?.c;
          zone = center ? { zone_code: center.zone_code, zone_name: center.zone_name, zone_type: center.zone_type } : null;

          zoningCache.current[key] = { gridCells, legend, zone, cellLat, cellLng };
        }

        setZoneInfo(zone);
        setZoningLegend(legend);
        setZoningFallback(null);
        console.log("[ZONING MAP DIAG] legend rendered with", legend.length, "districts /", gridCells.length, "cells");

        // Parcel boundary highlight for Target A (best-effort).
        const pres = await realieParcelsInRing({
          lat: targetA.latitude, lon: targetA.longitude, radius_miles: 0.3,
        }).catch(() => null);
        const zParcels = pres?.data?.parcels || [];

        map = await renderZoningGrid(refs.zoning.current, targetA, token, gridCells, cellLat, cellLng, zone, zParcels);
      } else if (step === "wetlands") {
        map = await renderWetlands(refs.wetlands.current, targetA, token);
      } else if (step === "parcel") {
        const pres = await realieParcelsInRing({
          lat: targetA.latitude, lon: targetA.longitude, radius_miles: 0.5,
        }).catch(() => null);
        const parcels = pres?.data?.parcels || [];
        map = await renderParcel(refs.parcel.current, targetA, parcels, token, cfg.zoneomicsApiKey);
      }

      maps.current[step] = map;
      setCompleted((prev) => ({ ...prev, [step]: true }));
      toast.success(`${step.charAt(0).toUpperCase() + step.slice(1)} map generated for Target A.`);
    } catch (err) {
      if (step === "aerial") console.error("[AERIAL DIAG] renderAerial threw:", err);
      else console.error(err);
      toast.error(err?.message || `${step} map failed.`);
      setErrors((p) => ({ ...p, [step]: err?.message || "Unknown error" }));
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
    zoning: (
      <>
        {zoneInfo?.zone_code ? (
          <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/20 border-y border-emerald-300/50 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            Zoneomics district at Target A: <span className="font-mono">{zoneInfo.zone_code}</span>
            {zoneInfo.zone_name ? <span className="font-normal opacity-80"> — {zoneInfo.zone_name}</span> : null}
          </div>
        ) : targetA?.zoning_classification ? (
          <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/20 border-y border-emerald-300/50 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            Target A zoning classification: <span className="font-mono">{targetA.zoning_classification}</span>
          </div>
        ) : null}
        {zoningFallback ? (
          <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-y border-amber-300/50 text-sm font-medium text-amber-800 dark:text-amber-200">
            {zoningFallback}
          </div>
        ) : null}
      </>
    ),
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
          error={errors.aerial}
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
          onRun={() => { console.log("[ZONING MAP DIAG] click handler fired"); runStep("zoning"); }}
          mapRef={refs.zoning} banner={banners.zoning} error={errors.zoning}
        >
          {/* Floating color-coded legend — pulled up to overlay the bottom-left of
              the 560px map area above (children render after the map in flow).
              Wrapper is click-through; only the legend itself captures clicks. */}
          <div className="relative h-0 pointer-events-none">
            <div className="absolute left-0 z-10 pointer-events-auto" style={{ bottom: 16 + 560 }}>
              <ZoningLegend districts={zoningLegend} />
            </div>
          </div>
        </MapSubStep>
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