/**
 * Section4MapSuite — SiteHawk pipeline step 4 ("HAWK TARGET A MAP SUITE").
 *
 * Seven maps, generated ONE AT A TIME, each by its own button. EVERY map renders
 * for TARGET A ONLY (never Target B/C). Strict gating:
 *  - LOCKED until Section 3 (Targets) is complete AND Target A is resolved.
 *  - pipelineStep enters "maps"; seven sub-steps fire in sequence, each ONLY on
 *    its own button click: aerial → topo → fema → zoning → flum → wetlands → parcel.
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
import SkipTraceStep from "./section4/SkipTraceStep";
import DeedStep from "./section4/DeedStep";
import ComplianceStep from "./section4/ComplianceStep";
import { skipTraceCascade } from "@/functions/skipTraceCascade";
import SectionClearButton from "./SectionClearButton";
import { loadPublicConfig } from "@/lib/publicConfig";
import { realieParcelsInRing } from "@/functions/realieParcelsInRing";
import { reportAllParcels } from "@/functions/reportAllParcels";
import { femaFloodLookup } from "@/functions/femaFloodLookup";
import { nearestAirportFromDirectory } from "@/functions/nearestAirportFromDirectory";
import { cellTowerLookup } from "@/functions/cellTowerLookup";
import { windSpeedLookup } from "@/functions/windSpeedLookup";
import { carrierFinderFiber } from "@/functions/carrierFinderFiber";
import { electricUtilityLookup } from "@/functions/electricUtilityLookup";
import { scipViewshed } from "@/functions/scipViewshed";
import ViewshedTiles from "./section4/ViewshedTiles";
import RowIndicatorStep from "./section4/RowIndicatorStep";
import RegridLayerToggle from "./section4/RegridLayerToggle";
import CustomizeProbe from "@/components/maps/CustomizeProbe";
import {
  ensureMapboxLoaded, renderAerial, renderTopo, renderFema,
  renderZoningGrid, renderFlumPolygon, renderRegridZoningMap, renderWetlands, renderAirport, renderCellTower, renderParcel, renderWind, renderFiber, renderPower, fetchPowerInfrastructure, BRAND_GREEN, buildCircle,
} from "@/lib/section4Maps";

import { zoneResolve } from "@/functions/zoneResolve";



import ZoningLegend from "./section4/ZoningLegend";
import { SOURCE_LABELS } from "@/lib/brandedLabels";

const STEPS = ["aerial", "topo", "fema", "zoning", "flum", "wetlands", "airport", "celltower", "parcel", "row", "wind", "fiber", "power", "viewshed", "compliance"];

// Build the ROW-step enrichment (Target A parcel) + ring stats from the Realie
// ring parcels — replaces the fields Regrid used to return as target_a_enrichment
// and ring_stats, so the ROW / Premium Indicators panel keeps working on Realie.
function deriveRingEnrichment(parcels, lat, lon) {
  if (!Array.isArray(parcels) || !parcels.length) {
    return { target: null, stats: { total: 0, row_count: 0, stacked_count: 0, vacant_count: 0 } };
  }
  let target = parcels[0], best = Infinity;
  for (const p of parcels) {
    if (p.latitude == null || p.longitude == null) continue;
    const d = Math.hypot(p.latitude - lat, p.longitude - lon);
    if (d < best) { best = d; target = p; }
  }
  const stats = {
    total: parcels.length,
    row_count: parcels.filter((p) => p.row_flag === true || p.row_type).length,
    stacked_count: parcels.filter((p) => p.stacked).length,
    vacant_count: parcels.filter((p) => p.usps_vacancy === "V").length,
  };
  return { target, stats };
}

export default function Section4MapSuite({
  unlocked, active, targetA, srcLat, srcLon, radiusMiles = 0.5, ringName, towerHeightFt = 0, sectionData = {}, onRun, onComplete, onData, onClear,
}) {
  // Which sub-steps have completed. Aerial is the only one initially unlocked.
  const [completed, setCompleted] = useState({});
  const [loadingStep, setLoadingStep] = useState(null);
  const [floodZone, setFloodZone] = useState(null);
  const [zoneInfo, setZoneInfo] = useState(null);
  const [flumInfo, setFlumInfo] = useState(null);
  const [airportInfo, setAirportInfo] = useState(null);
  const [cellTowerInfo, setCellTowerInfo] = useState(null);
  const [windInfo, setWindInfo] = useState(null);
  const [fiberInfo, setFiberInfo] = useState(null);
  const [powerInfo, setPowerInfo] = useState(null);
  // 2D directional viewshed result ({ aerial_ring_url, tower_height_ft, directions }).
  const [viewshedInfo, setViewshedInfo] = useState(null);
  const [rowEnrichment, setRowEnrichment] = useState(null);
  const [rowRingStats, setRowRingStats] = useState(null);
  // Full ring parcels (with geometry) cached from the Parcel Map pull — feeds the ROW map.
  const [rowParcels, setRowParcels] = useState([]);
  // Track whether the Zoning/FLUM maps were drawn with Regrid data (shows layer toggle)
  const [zoningUsedRegrid, setZoningUsedRegrid] = useState(false);
  const [flumUsedRegrid, setFlumUsedRegrid] = useState(false);
  // Hawk Skip-Trace result for Target A's owner (phones + emails across all sources).
  const [skipTraceInfo, setSkipTraceInfo] = useState(null);
  // Warranty Deed of record for Target A (Realie click lookup). null = no deed found.
  const [deedInfo, setDeedInfo] = useState(null);
  // Zoning legend (color-coded districts) + a fallback notice when no tiles.
  const [zoningLegend, setZoningLegend] = useState([]);
  const [zoningFallback, setZoningFallback] = useState(null);
  // Cache the resolved legend list per Target A coordinate so re-clicks skip the query.
  const zoningCache = useRef({});
  // Per-step error message (currently surfaced for the aerial sub-step).
  const [errors, setErrors] = useState({});

  // Fire onComplete once all seven maps are done — unlocks Section 6.
  useEffect(() => {
    if (STEPS.every((s) => completed[s])) onComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  const refs = {
    aerial: useRef(null), topo: useRef(null), fema: useRef(null),
    zoning: useRef(null), flum: useRef(null), wetlands: useRef(null), airport: useRef(null), celltower: useRef(null), parcel: useRef(null), wind: useRef(null), fiber: useRef(null), power: useRef(null), viewshed: useRef(null),
  };
  const maps = useRef({});
  // Creation order of live Mapbox instances. Browsers cap live WebGL contexts
  // (~16); beyond that, the OLDEST map canvases silently go blank ("close").
  // We keep only the newest MAX_LIVE_MAPS live and freeze older ones into a
  // static snapshot image — the map stays visible, it just stops being pannable.
  const liveOrder = useRef([]);
  const MAX_LIVE_MAPS = 3;
  // Snapshot of each map captured the moment it finished rendering (while the
  // WebGL canvas is guaranteed healthy). Retirement uses THIS image — capturing
  // at retire time was returning blank frames once the browser evicted the
  // context, which made earlier maps "close down" by map 14.
  const snapshots = useRef({});

  const looksBlank = (url) => !url || url.length < 5000; // blank JPEGs encode tiny

  const retireOldMaps = useCallback(() => {
    while (liveOrder.current.length > MAX_LIVE_MAPS) {
      const oldStep = liveOrder.current.shift();
      const m = maps.current[oldStep];
      const container = refs[oldStep]?.current;
      if (m) {
        try {
          // Try a live capture first; fall back to the healthy snapshot taken at load.
          let url = null;
          try { url = container ? m.getCanvas().toDataURL("image/jpeg", 0.9) : null; } catch { /* dead context */ }
          if (looksBlank(url)) url = snapshots.current[oldStep] || url;
          m.remove();
          if (url && container) {
            const img = document.createElement("img");
            img.src = url;
            img.setAttribute("data-snapshot", "1");
            img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover";
            container.appendChild(img);
          }
        } catch { try { m.remove(); } catch { /* already gone */ } }
      }
      maps.current[oldStep] = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      Object.values(maps.current).forEach((m) => m?.remove?.());
      maps.current = {};
      liveOrder.current = [];
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

      // Dispose any prior instance (and stale snapshot) for this step before re-rendering.
      maps.current[step]?.remove?.();
      maps.current[step] = null;
      liveOrder.current = liveOrder.current.filter((s) => s !== step);
      refs[step]?.current?.querySelectorAll('img[data-snapshot]')?.forEach((el) => el.remove());
      await new Promise((r) => requestAnimationFrame(r));

      let map;
      if (step === "aerial") {
        const ringFeature = buildCircle(srcLat, srcLon, radiusMiles);
        console.log("[AERIAL DIAG] SARF ring GeoJSON feature:", ringFeature);
        console.log("[AERIAL DIAG] Aerial container mounted:", !!refs.aerial.current);
        map = await renderAerial(refs.aerial.current, targetA, srcLat, srcLon, radiusMiles, token);
        console.log("[AERIAL DIAG] renderAerial resolved — map instance:", !!map);
      } else if (step === "topo") {
        map = await renderTopo(refs.topo.current, targetA, token, srcLat, srcLon, radiusMiles);
      } else if (step === "fema") {
        const [m, fres] = await Promise.all([
          renderFema(refs.fema.current, targetA, token, srcLat, srcLon, radiusMiles),
          femaFloodLookup({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null),
        ]);
        map = m;
        const fz = fres?.data?.fema_zone || fres?.data?.fema_risk_factor || null;
        setFloodZone(fz);
        // Emit FEMA factor to the bus — §4 centroid lookup is canonical for FEMA.
        onData?.({ fema: { flood_zone: fz } });
      } else if (step === "zoning") {
        // Realie is the primary parcel/zoning source (geometry + zoning included).
        const [rgRes, zfres] = await Promise.all([
          realieParcelsInRing({ lat: targetA.latitude, lon: targetA.longitude, mode: "click" }).catch(() => null),
          zoneResolve({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null),
        ]);
        const rgParcels = rgRes?.data?.parcels || [];
        const rgParcel = rgParcels[0] || null;
        const rgZoning = rgParcel?.zoning || rgParcel?.zoning_description || null;
        const rgZoningType = rgParcel?.zoning_type || null;

        // Prefer Regrid zoning code, fall back to zoneResolve, then targetA
        const zoningLabel = rgZoning
          || zfres?.data?.zoning?.zone_code
          || targetA?.zoning_classification
          || null;
        const zoningLabel2 = rgZoningType ? `${zoningLabel} (${rgZoningType})` : zoningLabel;
        const zone = zoningLabel ? { zone_code: zoningLabel, zone_name: rgZoningType || null } : null;
        setZoneInfo(zone);
        setZoningLegend([]);

        // Build a FeatureCollection of Regrid parcel polygons colored by zone code
        const rgFeatures = rgParcels
          .filter((p) => p.parcel_geometry)
          .map((p) => ({ type: "Feature", geometry: p.parcel_geometry, properties: { zoning: p.zoning || p.zoning_description || "—", apn: p.apn || "" } }));
        const rgFC = rgFeatures.length ? { type: "FeatureCollection", features: rgFeatures } : null;

        // Fallback polygon from zoneResolve if Regrid has no geometry
        const zoningPolygon = rgFC || zfres?.data?.zoning_polygon || null;
        setZoningFallback(zoningPolygon ? null : "No zoning polygon found — verify district with local zoning dept.");
        if (zoningLabel) onData?.({ zoneomicsDistrict: { zone_code: zoningLabel, zone_name: rgZoningType || null } });

        // Render: if we have Regrid parcel polygons, use the dedicated renderer
        if (rgFC) {
          setZoningUsedRegrid(true);
          map = await renderRegridZoningMap(refs.zoning.current, targetA, token, rgFC, zoningLabel2 ? `Zoning: ${zoningLabel2}` : "Zoning Map", "zoning");
        } else {
          setZoningUsedRegrid(false);
          map = await renderFlumPolygon(refs.zoning.current, targetA, token, zoningPolygon, zoningLabel ? `Zoning: ${zoningLabel}` : "Zoning Map");
        }
      } else if (step === "flum") {
        // Future Land Use map — try Regrid land_use field first, then zoneResolve (FL GeoPlan)
        let flum = null;
        let fluFeature = null;

        const [rgRes, fres] = await Promise.all([
          realieParcelsInRing({ lat: targetA.latitude, lon: targetA.longitude, mode: "click" }).catch(() => null),
          zoneResolve({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null),
        ]);
        const rgParcels = rgRes?.data?.parcels || [];
        const rgParcel = rgParcels[0] || null;

        // zoneResolve FLU (FL GeoPlan) — polygon + code
        const flu = fres?.data?.flu || null;
        fluFeature = flu?.geojson || null;
        if (flu) flum = { code: flu.code, name: flu.label };

        // If no zoneResolve FLU, try Regrid land_use / lbcs fields
        if (!flum && rgParcel) {
          const luCode = rgParcel.land_use || rgParcel.lbcs_function || null;
          if (luCode) flum = { code: luCode, name: rgParcel.zoning_description || null };
        }

        // Build Regrid parcel polygons as a FLU FeatureCollection fallback
        const rgFeatures = rgParcels
          .filter((p) => p.parcel_geometry)
          .map((p) => ({ type: "Feature", geometry: p.parcel_geometry, properties: { flu: p.land_use || p.zoning_description || "—", apn: p.apn || "" } }));
        const rgFC = rgFeatures.length ? { type: "FeatureCollection", features: rgFeatures } : null;
        // Prefer zoneResolve polygon (authoritative), fall back to Regrid polygons
        if (!fluFeature && rgFC) fluFeature = rgFC;

        const flumLabel = flum ? [flum.code, flum.name].filter(Boolean).join(" — ") : "";
        setFlumInfo(flum && (flum.code || flum.name) ? flum : null);
        if (!flum && !fluFeature) {
          toast.message("No Future Land Use designation found for this location. Regrid may not have FLU data for this county.");
        }

        // If we have Regrid parcel polygons (no FL GeoPlan polygon), use dedicated renderer
        if (rgFC && !flu?.geojson) {
          setFlumUsedRegrid(true);
          map = await renderRegridZoningMap(refs.flum.current, targetA, token, rgFC, flumLabel ? `FLUM: ${flumLabel}` : "Future Land Use Map", "flu");
        } else {
          setFlumUsedRegrid(false);
          map = await renderFlumPolygon(refs.flum.current, targetA, token, fluFeature, flumLabel);
        }
      } else if (step === "wetlands") {
        map = await renderWetlands(refs.wetlands.current, targetA, token, srcLat, srcLon, radiusMiles);
      } else if (step === "airport") {
        const ares = await nearestAirportFromDirectory({ lat: targetA.latitude, lon: targetA.longitude });
        const airport = ares.data?.match;
        if (!airport) throw new Error("No airport found near Target A.");
        setAirportInfo(airport);
        onData?.({ airport: { name: airport.name || airport.callnumber || null, distance_miles: Number(airport.distance_miles), type: airport.type || null } });
        map = await renderAirport(refs.airport.current, targetA, airport, token);
      } else if (step === "celltower") {
        const cres = await cellTowerLookup({ lat: targetA.latitude, lon: targetA.longitude });
        const nt = cres.data?.nearest_tower;
        if (!nt || nt.latitude_deg == null || nt.longitude_deg == null) throw new Error("No cell tower found near Target A.");
        // Normalize to the shape renderCellTower + the banner expect.
        const tower = {
          site_name: nt.licensee || nt.call_letters || "Cell Site",
          market: nt.structure_type || null,
          latitude: nt.latitude_deg,
          longitude: nt.longitude_deg,
          distance_miles: nt.distance_miles,
        };
        setCellTowerInfo(tower);
        onData?.({ tower: { owner: nt.licensee || null, distance_miles: Number(nt.distance_miles), height_ft: nt.overall_height_ft ?? null, source: cres.data?.source || "FCC ASR / OpenCellID" } });
        map = await renderCellTower(refs.celltower.current, targetA, tower, token);
      } else if (step === "parcel") {
        // Realie is the primary parcel source for the ring overlay (geometry,
        // ownership, ROW/tax/deed fields all included).
        const pres = await realieParcelsInRing({
          lat: srcLat, lon: srcLon, radius_miles: radiusMiles,
        }).catch(() => null);
        const parcels = pres?.data?.parcels || [];
        // Cache the enrichment + parcels for the ROW step (same call, no re-fetch).
        const enr = deriveRingEnrichment(parcels, srcLat, srcLon);
        if (enr.target) setRowEnrichment(enr.target);
        setRowRingStats(enr.stats);
        if (parcels.length) setRowParcels(parcels);
        map = await renderParcel(refs.parcel.current, targetA, parcels, token, cfg.zoneomicsApiKey, ringName, srcLat, srcLon, radiusMiles);
      } else if (step === "row") {
        // ROW step: data already fetched during the Parcel Map step — no new call.
        // If for some reason it's missing, re-fetch now.
        if (!rowEnrichment) {
          const pres = await realieParcelsInRing({
            lat: srcLat, lon: srcLon, radius_miles: radiusMiles,
          }).catch(() => null);
          const parcels = pres?.data?.parcels || [];
          const enr = deriveRingEnrichment(parcels, srcLat, srcLon);
          if (enr.target) setRowEnrichment(enr.target);
          setRowRingStats(enr.stats);
          if (parcels.length) setRowParcels(parcels);
        }
        onData?.({ regrid_premium: rowEnrichment });
        map = null; // no Mapbox canvas for this step
      } else if (step === "wind") {
        const wres = await windSpeedLookup({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null);
        const wind = wres?.data || null;
        setWindInfo(wind);
        onData?.({ wind: { wind_speed_mph: wind?.wind_speed_mph ?? null, risk_level: wind?.wind_risk_level ?? null } });
        map = await renderWind(refs.wind.current, targetA, token);
      } else if (step === "fiber") {
        const fres = await carrierFinderFiber({ lat: targetA.latitude, lon: targetA.longitude, radius_miles: 1.0 });
        const body = fres?.data ?? fres;
        const litBuildings = body?.lit_buildings || [];
        const telco = body?.telco || null;
        // Nearest lit carrier (smallest distance) for the banner.
        const nearestLit = litBuildings
          .filter((b) => b.carrier)
          .sort((a, b) => (a.distance_int ?? Infinity) - (b.distance_int ?? Infinity))[0] || null;
        setFiberInfo({ telco, count: litBuildings.length, nearestLit });
        onData?.({ fiber: { count: litBuildings.length }, carriers: { telco, count: litBuildings.length, lit_buildings: litBuildings } });
        map = await renderFiber(refs.fiber.current, targetA, litBuildings, token, 1.0);
      } else if (step === "power") {
        const [power, ures] = await Promise.all([
          fetchPowerInfrastructure(targetA.latitude, targetA.longitude),
          electricUtilityLookup({ lat: targetA.latitude, lon: targetA.longitude }).catch(() => null),
        ]);
        const serving = ures?.data?.utility_name ? ures.data : null;
        setPowerInfo({ ...power, serving });
        onData?.({ power_grid: { nearest_substation_mi: power?.closestSubstation?.distanceMiles ?? null, substation_voltage_kv: power?.closestSubstation?.voltage ?? null, transmission_lines: power?.transmissionLines ?? 0, serving_utility: serving?.utility_name ?? null } });
        map = await renderPower(refs.power.current, targetA, power, token);
      } else if (step === "viewshed") {
        // 2D directional viewshed — N/S/E/W tree-line maps + USGS line-of-sight
        // profiles for Target A. Static images (no Mapbox instance to dispose).
        const vres = await scipViewshed({
          lat: targetA.latitude,
          lon: targetA.longitude,
          ring_miles: radiusMiles,
          tower_height_ft: Number(towerHeightFt) > 0 ? Number(towerHeightFt) : 199,
        });
        const viewshed = vres?.data?.viewshed;
        if (!viewshed) throw new Error("No viewshed returned for Target A.");
        setViewshedInfo(viewshed);
        onData?.({ viewshed });
        map = null;
      }

      maps.current[step] = map;
      if (map) {
        // Capture a healthy snapshot as soon as the map fully renders — this is
        // what retirement falls back to if the live canvas has gone blank.
        const capture = () => {
          try {
            const url = map.getCanvas().toDataURL("image/jpeg", 0.9);
            if (!looksBlank(url)) snapshots.current[step] = url;
          } catch { /* capture is best-effort */ }
        };
        map.once("idle", capture);
        setTimeout(capture, 8000); // second pass once tiles have settled
        liveOrder.current.push(step);
        // Retire the oldest live map(s) AFTER this one is up — snapshot happens
        // while the old canvas is still healthy, so nothing ever goes blank.
        setTimeout(retireOldMaps, 3000);
      }
      // Re-measure once the panel has settled so the map is properly centered —
      // Mapbox can mis-center when the canvas resizes right after init.
      if (map?.resize) {
        const c = map.getCenter?.();
        const z = map.getZoom?.();
        setTimeout(() => {
          map.resize();
          if (c) map.jumpTo({ center: c, zoom: z });
        }, 400);
      }
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

  // Compliance (Map 12) is NOT a Mapbox render — its pre-screen runs inside
  // ComplianceStep. Run handler just shows a brief spinner then marks it done.
  const runCompliance = useCallback(() => {
    setLoadingStep("compliance");
    setTimeout(() => {
      setCompleted((prev) => ({ ...prev, compliance: true }));
      setLoadingStep(null);
    }, 600);
  }, []);

  // Hawk Skip-Trace (final step) — runs the multi-source cascade for Target A's
  // owner. Long-running (~90s) so WhitePages is never skipped; own button.
  const runSkipTrace = useCallback(async () => {
    const owner = targetA?.owner_name || targetA?.owner || "";
    if (!owner) {
      setErrors((p) => ({ ...p, skiptrace: "No Target A owner name to trace — re-run Section 3." }));
      return;
    }
    setErrors((p) => ({ ...p, skiptrace: null }));
    setLoadingStep("skiptrace");
    try {
      const res = await skipTraceCascade({
        owner_name: owner,
        mailing_address: targetA?.mailing_address || targetA?.parcel_address || "",
        target_label: "Target A",
      });
      const data = res?.data ?? res;
      setSkipTraceInfo(data);
      onData?.({ skip_trace: data });
      setCompleted((prev) => ({ ...prev, skiptrace: true }));
      toast.success("Skip-Trace complete for Target A.");
    } catch (err) {
      console.error(err);
      setErrors((p) => ({ ...p, skiptrace: err?.message || "Skip-Trace failed." }));
      toast.error(err?.message || "Skip-Trace failed.");
    } finally {
      setLoadingStep(null);
    }
  }, [targetA, onData]);

  // Warranty Deed lookup for Target A — pulls the deed of record & chain of
  // title from Realie (click) first, then backfills any missing fields from
  // ReportAll USA (point lookup). Shows "Not Available For This Target" only
  // when NEITHER source returns deed data.
  const runDeed = useCallback(async () => {
    setErrors((p) => ({ ...p, deed: null }));
    setLoadingStep("deed");
    try {
      const [realieRes, reportAllRes] = await Promise.all([
        realieParcelsInRing({ mode: "click", lat: targetA.latitude, lon: targetA.longitude }).catch(() => null),
        reportAllParcels({ mode: "point", lat: targetA.latitude, lon: targetA.longitude }).catch(() => null),
      ]);
      const rp = realieRes?.data?.parcels?.[0] || null;
      const ra = reportAllRes?.data?.parcels?.[0] || null;
      // Prefer Realie fields; fall back to ReportAll where Realie is blank.
      const deed = (rp || ra) ? {
        owner_name: rp?.owner_name || ra?.owner_name || targetA?.owner_name || "",
        deed_type: rp?.deed_type || null,
        deed_doc_num: rp?.deed_doc_num || null,
        deed_book: rp?.deed_book || null,
        ownership_start: rp?.ownership_start || null,
        last_sale_date: rp?.last_sale_date || ra?.last_sale_date || null,
        last_sale_price: rp?.last_sale_price || ra?.last_sale_price || null,
        legal_description: rp?.legal_description || ra?.legal_description || null,
        transfers: rp?.transfers || [],
        source: rp && (rp.deed_type || rp.last_sale_date || rp.legal_description) ? "Realie" : (ra ? "ReportAll USA" : "Realie"),
      } : null;
      setDeedInfo(deed);
      setCompleted((prev) => ({ ...prev, deed: true }));
    } catch (err) {
      console.error(err);
      setErrors((p) => ({ ...p, deed: err?.message || "Deed lookup failed." }));
    } finally {
      setLoadingStep(null);
    }
  }, [targetA]);

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
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">SCIP · SECTION 5 · LOCKED</div>
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

  // Physical-fit basis for the Customize probe on the Parcel Map: prefer Target
  // A's own parcel geometry, else the ring parcel matching its APN, else the
  // ring parcel nearest to Target A's coordinates.
  const parcelGeometryForProbe = (() => {
    if (targetA?.parcel_geometry) return targetA.parcel_geometry;
    if (!Array.isArray(rowParcels) || !rowParcels.length) return null;
    const byApn = targetA?.apn && rowParcels.find((p) => p.apn && String(p.apn) === String(targetA.apn));
    if (byApn?.parcel_geometry) return byApn.parcel_geometry;
    if (targetA?.latitude != null && targetA?.longitude != null) {
      let best = null, bestD = Infinity;
      for (const p of rowParcels) {
        if (!p.parcel_geometry || p.latitude == null || p.longitude == null) continue;
        const d = Math.hypot(p.latitude - targetA.latitude, p.longitude - targetA.longitude);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best?.parcel_geometry) return best.parcel_geometry;
    }
    return null;
  })();

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
            {SOURCE_LABELS.zoneomics} — district at Target A: <span className="font-mono">{zoneInfo.zone_code}</span>
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
    flum: flumInfo ? (
      <div className="px-4 py-2 bg-violet-50 dark:bg-violet-950/20 border-y border-violet-300/50 text-sm font-semibold text-violet-800 dark:text-violet-200">
        Future Land Use at Target A: <span className="font-mono">{[flumInfo.code, flumInfo.name].filter(Boolean).join(" — ")}</span>
        {flumInfo.description ? <span className="font-normal opacity-80"> — {flumInfo.description}</span> : null}
      </div>
    ) : null,
    wetlands: null,
    airport: airportInfo ? (
      <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-y border-amber-300/50 text-sm font-semibold text-amber-800 dark:text-amber-200">
        Nearest airport to Target A: <span className="font-mono">{airportInfo.name || airportInfo.callnumber}</span>
        {airportInfo.type ? <span className="font-normal opacity-80"> · {String(airportInfo.type).replace(/_/g, " ")}</span> : null}
        {" "}— <span className="font-mono">{Number(airportInfo.distance_miles).toFixed(2)} mi</span>
      </div>
    ) : null,
    celltower: cellTowerInfo ? (
      <div className="px-4 py-2 bg-cyan-50 dark:bg-cyan-950/20 border-y border-cyan-300/50 text-sm font-semibold text-cyan-800 dark:text-cyan-200">
        Nearest cell tower to Target A: <span className="font-mono">{cellTowerInfo.site_name || "Cell Site"}</span>
        {cellTowerInfo.market ? <span className="font-normal opacity-80"> · {cellTowerInfo.market}</span> : null}
        {" "}— <span className="font-mono">{Number(cellTowerInfo.distance_miles).toFixed(2)} mi</span>
      </div>
    ) : null,
    parcel: null,
    wind: windInfo?.wind_speed_mph ? (
      <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-y border-amber-300/50 text-sm font-semibold text-amber-800 dark:text-amber-200">
        ASCE 7-22 design wind speed at Target A: <span className="font-mono">{windInfo.wind_speed_mph} mph</span>
        {windInfo.wind_risk_level ? ` · ${windInfo.wind_risk_level} risk` : ""}
        {windInfo.in_hurricane_prone_region ? " · Hurricane-Prone Region" : ""}
      </div>
    ) : null,
    fiber: fiberInfo ? (
      <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/20 border-y border-emerald-300/50 text-sm text-emerald-800 dark:text-emerald-200 space-y-0.5">
        {fiberInfo.telco ? (
          <div>
            <span className="font-semibold">Local fiber telco:</span>{" "}
            <span className="font-mono">{fiberInfo.telco.name}</span>
            {fiberInfo.telco.parent && fiberInfo.telco.parent !== fiberInfo.telco.name ? <span className="opacity-80"> ({fiberInfo.telco.parent})</span> : null}
            {fiberInfo.telco.phone ? <span className="opacity-80"> · 📞 {fiberInfo.telco.phone}</span> : null}
            {fiberInfo.telco.co_distance ? <span className="opacity-80"> · CO {fiberInfo.telco.co_distance} away · {fiberInfo.telco.co_city}, {fiberInfo.telco.co_state}</span> : null}
          </div>
        ) : null}
        {fiberInfo.nearestLit ? (
          <div>
            <span className="font-semibold">Nearest lit carrier:</span>{" "}
            <span className="font-mono">{fiberInfo.nearestLit.carrier}</span>
            {fiberInfo.nearestLit.distance ? <span className="opacity-80"> · {fiberInfo.nearestLit.distance} ft</span> : null}
          </div>
        ) : null}
        <div className="opacity-80 text-xs">{fiberInfo.count} fiber-lit / near-net building{fiberInfo.count !== 1 ? "s" : ""} within 1 mi · green = On-Net (lit), yellow = Near-Net</div>
      </div>
    ) : null,
    power: powerInfo ? (
      <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-950/20 border-y border-yellow-300/50 text-sm text-yellow-800 dark:text-yellow-200 space-y-0.5">
        {powerInfo.serving ? (
          <div>
            <span className="font-semibold">Utility to contact:</span>{" "}
            <span className="font-mono">{powerInfo.serving.utility_name}</span>
            {powerInfo.serving.utility_type ? <span className="opacity-80"> · {powerInfo.serving.utility_type}</span> : null}
            {powerInfo.serving.telephone ? <span className="opacity-80"> · 📞 {powerInfo.serving.telephone}</span> : null}
            {powerInfo.serving.website ? <span className="opacity-80"> · 🌐 {powerInfo.serving.website}</span> : null}
          </div>
        ) : null}
        {powerInfo.closestSubstation ? (
          <div>
            <span className="font-semibold">Nearest substation / tie-in:</span>{" "}
            <span className="font-mono">{powerInfo.closestSubstation.name}</span>
            {" "}— <span className="font-mono">{powerInfo.closestSubstation.distanceMiles} mi</span>
            {powerInfo.closestSubstation.voltage ? <span className="opacity-80"> · {powerInfo.closestSubstation.voltage} kV</span> : null}
          </div>
        ) : (
          <div className="font-semibold">No substation found within ~5 mi of Target A.</div>
        )}
        <div className="opacity-80 text-xs">{powerInfo.transmissionLines} transmission line{powerInfo.transmissionLines !== 1 ? "s" : ""} in vicinity · orange = corridors, yellow = substations</div>
      </div>
    ) : null,
    viewshed: viewshedInfo ? (
      <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/20 border-y border-indigo-300/50 text-sm font-semibold text-indigo-800 dark:text-indigo-200">
        2D viewshed at Target A · {viewshedInfo.tower_height_ft} ft tower —{" "}
        {(viewshedInfo.directions || []).filter((d) => d.clear).length}/4 directions clear line-of-sight
      </div>
    ) : null,
  };

  return (
    <div data-tour="map-suite" className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Section banner */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 text-white" style={{ background: BRAND_GREEN }}>
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · SECTION 5 · MAP SUITE</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Target A Map Suite</h2>
            <div className="text-[11px] font-mono opacity-90 mt-0.5">
              Maps generated for Target A only{ownerLabel ? ` · ${ownerLabel}` : ""}
            </div>
          </div>
        </div>
        {active && onClear && <SectionClearButton onClear={onClear} />}
      </div>

      {/* Idle — armed, waiting for the first Run click */}
      {!active && (
        <div className="px-4 pt-6 text-sm text-muted-foreground">
          Generate fourteen Target A maps &amp; data steps one at a time — Aerial, Topography, FEMA Floodplain, Zoning, Future Land Use, Wetlands, Nearest Airport, Nearest Cell Tower, Parcel, ROW &amp; Premium Parcel Indicators, Wind Speed, Fiber Optics, Power Grid, 2D Viewshed — then the Section 106 / NEPA compliance report.
          Click <span className="font-semibold text-foreground">Run Aerial Map</span> below to begin.
        </div>
      )}

      <div className="p-4 space-y-4">
        <div data-tour="map-aerial">
        <MapSubStep
          index={1} title="Aerial Map" runLabel="Run Aerial Map"
          spinnerLabel="Generating Target A aerial map…"
          unlocked={isUnlocked("aerial")}
          loading={loadingStep === "aerial"} done={!!completed.aerial}
          onRun={() => beginAndRun("aerial")} mapRef={refs.aerial} banner={banners.aerial}
          error={errors.aerial}
        />
        </div>
        <div data-tour="map-topo">
        <MapSubStep
          index={2} title="Topography Map" runLabel="Run Topography Map"
          spinnerLabel="Generating Target A topography map…"
          unlocked={active && isUnlocked("topo")}
          loading={loadingStep === "topo"} done={!!completed.topo}
          onRun={() => runStep("topo")} mapRef={refs.topo} banner={banners.topo}
        />
        </div>
        <MapSubStep
          index={3} title="Floodplain (FEMA) Map" runLabel="Run FEMA Map" tourKey="map-fema"
          spinnerLabel="Generating Target A FEMA floodplain map…"
          unlocked={active && isUnlocked("fema")}
          loading={loadingStep === "fema"} done={!!completed.fema}
          onRun={() => runStep("fema")} mapRef={refs.fema} banner={banners.fema}
        />
        <MapSubStep
          index={4} title="Zoning Map" runLabel="Run Zoning Map" tourKey="map-zoning"
          spinnerLabel="Generating Target A zoning map…"
          unlocked={active && isUnlocked("zoning")}
          loading={loadingStep === "zoning"} done={!!completed.zoning}
          onRun={() => { console.log("[ZONING MAP DIAG] click handler fired"); runStep("zoning"); }}
          mapRef={refs.zoning} banner={banners.zoning} error={errors.zoning}
        >
          {zoningUsedRegrid && completed.zoning && (
            <RegridLayerToggle
              mapRef={{ current: maps.current["zoning"] }}
              fieldKey="zoning"
              zoneInfo={zoneInfo}
            />
          )}
          {!zoningUsedRegrid && zoningLegend.length > 0 && (
            <ZoningLegend districts={zoningLegend} />
          )}
        </MapSubStep>
        <MapSubStep
          index={5} title="Future Land Use (FLUM) Map" runLabel="Run FLUM Map" tourKey="map-flum"
          spinnerLabel="Generating Target A future land use map…"
          unlocked={active && isUnlocked("flum")}
          loading={loadingStep === "flum"} done={!!completed.flum}
          onRun={() => runStep("flum")} mapRef={refs.flum} banner={banners.flum}
        >
          {flumUsedRegrid && completed.flum && (
            <RegridLayerToggle
              mapRef={{ current: maps.current["flum"] }}
              fieldKey="flu"
              zoneInfo={flumInfo}
            />
          )}
        </MapSubStep>
        <MapSubStep
          index={6} title="Wetlands Map" runLabel="Run Wetlands Map" tourKey="map-wetlands"
          spinnerLabel="Generating Target A wetlands map…"
          unlocked={active && isUnlocked("wetlands")}
          loading={loadingStep === "wetlands"} done={!!completed.wetlands}
          onRun={() => runStep("wetlands")} mapRef={refs.wetlands} banner={banners.wetlands}
        />
        <MapSubStep
          index={7} title="Nearest Airport Map" runLabel="Run Nearest Airport Map" tourKey="map-airport"
          spinnerLabel="Finding nearest airport to Target A…"
          unlocked={active && isUnlocked("airport")}
          loading={loadingStep === "airport"} done={!!completed.airport}
          onRun={() => runStep("airport")} mapRef={refs.airport} banner={banners.airport}
        />
        <MapSubStep
          index={8} title="Nearest Cell Tower Map" runLabel="Run Nearest Cell Tower Map" tourKey="map-celltower"
          spinnerLabel="Finding nearest cell tower to Target A…"
          unlocked={active && isUnlocked("celltower")}
          loading={loadingStep === "celltower"} done={!!completed.celltower}
          onRun={() => runStep("celltower")} mapRef={refs.celltower} banner={banners.celltower}
        />
        <MapSubStep
          index={9} title="Parcel Map" runLabel="Run Parcel Map" tourKey="map-parcel"
          spinnerLabel="Generating Target A parcel map…"
          unlocked={active && isUnlocked("parcel")}
          loading={loadingStep === "parcel"} done={!!completed.parcel}
          onRun={() => runStep("parcel")} mapRef={refs.parcel} banner={banners.parcel}
          overlay={completed.parcel && (
            <CustomizeProbe
              mapRef={{ current: maps.current["parcel"] }}
              ready={!!completed.parcel}
              parcelGeometry={parcelGeometryForProbe}
              zoning={zoneInfo?.zone_code || targetA?.zoning_classification || null}
              heightFt={Number(towerHeightFt) > 0 ? Number(towerHeightFt) : 199}
            />
          )}
        />
        <div data-tour="map-row">
        <RowIndicatorStep
          index={10}
          unlocked={active && isUnlocked("row")}
          loading={loadingStep === "row"}
          done={!!completed.row}
          enrichment={rowEnrichment}
          ringStats={rowRingStats}
          parcels={rowParcels}
          targetA={targetA}
          error={errors.row}
          onRun={() => runStep("row")}
        />
        </div>
        <MapSubStep
          index={11} title="Wind Speed Map" runLabel="Run Wind Speed Map" tourKey="map-wind"
          spinnerLabel="Generating Target A wind speed map…"
          unlocked={active && isUnlocked("wind")}
          loading={loadingStep === "wind"} done={!!completed.wind}
          onRun={() => runStep("wind")} mapRef={refs.wind} banner={banners.wind}
        />
        <MapSubStep
          index={12} title="Fiber Optics Map" runLabel="Run Fiber Optics Map" tourKey="map-fiber"
          spinnerLabel="Finding fiber optics infrastructure near Target A…"
          unlocked={active && isUnlocked("fiber")}
          loading={loadingStep === "fiber"} done={!!completed.fiber}
          onRun={() => runStep("fiber")} mapRef={refs.fiber} banner={banners.fiber}
        />
        <MapSubStep
          index={13} title="Power Map" runLabel="Run Power Map" tourKey="map-power"
          spinnerLabel="Mapping power grid, substations & transmission lines near Target A…"
          unlocked={active && isUnlocked("power")}
          loading={loadingStep === "power"} done={!!completed.power}
          onRun={() => runStep("power")} mapRef={refs.power} banner={banners.power}
        />
        <MapSubStep
          index={14} title="2D Viewshed Map" runLabel="Run 2D Viewshed Map" tourKey="map-viewshed"
          spinnerLabel="Generating Target A N/S/E/W viewshed maps & line-of-sight profiles…"
          unlocked={active && isUnlocked("viewshed")}
          loading={loadingStep === "viewshed"} done={!!completed.viewshed}
          onRun={() => runStep("viewshed")} mapRef={refs.viewshed} banner={banners.viewshed}
          fillContent={<ViewshedTiles viewshed={viewshedInfo} />}
        />
        <ComplianceStep
          unlocked={active && isUnlocked("compliance")}
          loading={loadingStep === "compliance"}
          done={!!completed.compliance}
          targetA={targetA}
          sectionData={sectionData}
          towerHeightFt={towerHeightFt}
          ringName={ringName}
          onRun={runCompliance}
        />
        <DeedStep
          index={16}
          unlocked={active && !!completed.compliance}
          loading={loadingStep === "deed"}
          done={!!completed.deed}
          deed={deedInfo}
          error={errors.deed}
          ownerName={targetA?.owner_name || targetA?.owner || ""}
          onRun={runDeed}
        />
        <SkipTraceStep
          index={17}
          unlocked={active && !!completed.deed}
          loading={loadingStep === "skiptrace"}
          done={!!completed.skiptrace}
          result={skipTraceInfo}
          error={errors.skiptrace}
          ownerName={targetA?.owner_name || targetA?.owner || ""}
          onRun={runSkipTrace}
        />
      </div>
    </div>
  );
}