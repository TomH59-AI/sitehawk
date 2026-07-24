import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { point, booleanPointInPolygon, circle as turfCircle, area as turfArea, centroid as turfCentroid } from "@turf/turf";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText, Download, Send, CheckCircle2, AlertOctagon, Layers, Printer, Save } from "lucide-react";
import Generate3DImageButton from "@/components/towersiter/Generate3DImageButton";
import GeneratePhoto3DButton from "@/components/towersiter/GeneratePhoto3DButton";
import HawkFitPipelineSection from "@/components/hawkfit/HawkFitPipelineSection";
import NlcdLandCoverSection from "@/components/nlcd/NlcdLandCoverSection";
import TerrainMapSection from "@/components/terrain/TerrainMapSection";

import { recompute, makeFrame, polygonFromFrame, compoundRect, polygonFromCalls } from "@/lib/towerSiterEngine";
import { siterEntitlements, DEMO_PARCEL } from "@/lib/towerSiterAccess";
import { svgToPngDownload, svgToPdfDownload, exportExhibitB } from "@/lib/towerSiterExports";
import { classifyResult, normalizeOrdinanceRules, getResultMeta } from "@/lib/towerSiterResult";
import { computeLiveSiting, setbackBandGeometry } from "@/lib/towerSitingRules";
import LiveSitingVerdict from "@/components/towersiter/LiveSitingVerdict";
import { loadPublicConfig } from "@/lib/publicConfig";
import { towerSiterParcel } from "@/functions/towerSiterParcel";
import { towerSiterOrdinance } from "@/functions/towerSiterOrdinance";
import { towerSiterResidential } from "@/functions/towerSiterResidential";
import { towerSiterSitings } from "@/functions/towerSiterSitings";
import { scipExistingConditions } from "@/functions/scipExistingConditions";
import { talonfitRun } from "@/functions/talonfitRun";
import TalonFitCertifiedBadge from "@/components/talonfit/TalonFitCertifiedBadge";
import { regridBuildingFootprints } from "@/functions/regridBuildingFootprints";
import { useTowerSeparation } from "@/components/towersiter/TowerSeparationLayer";

import ParcelInputPanel from "../components/towersiter/ParcelInputPanel";
import SiterControls from "../components/towersiter/SiterControls";
import ComplianceChips from "../components/towersiter/ComplianceChips";
import RuleCard from "../components/towersiter/RuleCard";
import ExhibitA from "../components/towersiter/ExhibitA";
import ExportHawkProButton from "../components/towersiter/ExportHawkProButton";
import SiterMap from "../components/towersiter/SiterMap";
import UpgradeModal from "../components/towersiter/UpgradeModal";
import SitingDeepDive from "../components/towersiter/SitingDeepDive";
import SitingResultPanel from "../components/towersiter/SitingResultPanel";
import FeasibilityFinder from "../components/towersiter/FeasibilityFinder";

// HawkPerch — Tower Siter. Single source of truth for placement math is
// lib/towerSiterEngine.js (recompute pipeline). NO Zoneomics, NO Regrid —
// Realie only, ≈2 calls per siting, all logged to api_call_ledger.
export default function TowerSiter() {
  const [user, setUser] = useState(null);
  const ent = useMemo(() => siterEntitlements(user), [user]);

  const [parcel, setParcel] = useState(null);
  const [parcelOptions, setParcelOptions] = useState([]);
  const [rules, setRules] = useState(null);
  const [controls, setControls] = useState({ heightFt: 150, compoundW: 75, compoundD: 75, leaseW: 100, leaseD: 100, peToggle: false, peRadiusFt: "" });
  const [towerOverride, setTowerOverride] = useState(null);
  const [residential, setResidential] = useState(null); // { key, loading, result, circle }
  const [view, setView] = useState("map");
  const [busy, setBusy] = useState(false);
  const [upgrade, setUpgrade] = useState(null); // reason string | null
  const [sitingResult, setSitingResult] = useState(null); // perch-siting-solver verdict
  const [resultClass, setResultClass] = useState(null);
  const [savingRun, setSavingRun] = useState(false);
  const [savedRunId, setSavedRunId] = useState(null);
  const [talonRun, setTalonRun] = useState(null); // { run_id, certified } from the TalonFit audit log
  const [anonKey, setAnonKey] = useState(null);
  const { fetchTowers, towerData, separationCheck, loading: towerSepLoading, reset: resetTowerSep } = useTowerSeparation();
  const [clickMode, setClickMode] = useState(null);
  const [draftPoints, setDraftPoints] = useState([]);
  const [manualRect, setManualRect] = useState({ w: "", d: "" });
  const [pendingPlat, setPendingPlat] = useState(null);
  const [accessRoad, setAccessRoad] = useState(null); // { road_name, highway_label, road_type, ownership, permit_path, distance_ft }
  const [buildingsFC, setBuildingsFC] = useState(null);
  const [buildingStatus, setBuildingStatus] = useState("idle");
  const buildingRequestRef = useRef(0);
  const exhibitARef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
    loadPublicConfig().then((cfg) => setAnonKey(cfg?.hawkSupabaseAnonKey || null)).catch(() => {});
  }, []);

  /* ---------------- engine — recompute on every control change / drag ---------------- */
  const result = useMemo(() => {
    if (!parcel?.geometry || buildingStatus !== "ready") return null;
    try {
      // Normalize ordinance units before passing to the engine
      const normalizedRules = normalizeOrdinanceRules(rules, Number(controls.heightFt) || 199);
      return recompute({
        parcelGeoJSON: parcel.geometry,
        locationPoint: parcel.location?.coordinates || null,
        rules: normalizedRules || rules,
        towerHeightFt: Number(controls.heightFt) || 0,
        peToggle: controls.peToggle && ent.peAllowed,
        engineeredFallRadiusFt: controls.peRadiusFt === "" ? undefined : Number(controls.peRadiusFt),
        compoundW: Number(controls.compoundW) || 75,
        compoundD: Number(controls.compoundD) || 75,
        towerOverrideLonLat: towerOverride,
        buildingFootprints: buildingsFC,
      });
    } catch (e) {
      console.error("recompute failed:", e);
      return { collapsed: true, banner: "Could not compute a placement on this boundary — check the parcel geometry." };
    }
  }, [parcel, rules, controls, towerOverride, ent.peAllowed, buildingsFC, buildingStatus]);

  // Live drag verdict — recomputes on every drag tick since `result` recomputes.
  const liveSiting = useMemo(() => {
    if (!result || result.collapsed) return null;
    const normalizedRules = normalizeOrdinanceRules(rules, Number(controls.heightFt) || 199);
    return computeLiveSiting({
      result,
      rules: normalizedRules || rules,
      compoundW: Number(controls.compoundW) || 75,
      compoundD: Number(controls.compoundD) || 75,
      separationCheck,
      residential,
      peAvailable: (normalizedRules || rules)?.pe_fall_zone_allowed ?? null,
      peApplied: !!result.peApplied,
      unverified: !!result.unverified,
    });
  }, [result, rules, controls.heightFt, controls.compoundW, controls.compoundD, separationCheck, residential]);

  const leaseLonLat = useMemo(() => {
    if (!result || result.collapsed) return null;
    try {
      return compoundRect(result.towerFt, Number(controls.leaseW) || 100, Number(controls.leaseD) || 100, result.frame).lonLat;
    } catch { return null; }
  }, [result, controls.leaseW, controls.leaseD]);

  /* ---------------- parcel loading + tier gate (fires with the engine, not on page load) ---------------- */
  const loadParcel = useCallback(async (p, source) => {
    if (source !== "demo") {
      if (!ent.realParcels) {
        setUpgrade("Tower Siter on your own parcels requires a paid plan. The demo parcel is free to explore.");
        return;
      }
      if (Number.isFinite(ent.monthlyRuns)) {
        const { data } = await towerSiterSitings({ action: "count" });
        if ((data?.count ?? 0) >= ent.monthlyRuns) {
          setUpgrade(`You've used your ${ent.monthlyRuns} ${ent.label} sitings this month. Upgrade to HawkVision for unlimited sitings, clean exports and the PE toggle.`);
          return;
        }
      }
    }
    setParcel({ ...p, source });
    setParcelOptions([]);
    setTowerOverride(null);
    setResidential(null);
    setRules(null);
    setSitingResult(null);
    setResultClass(null);
    setSavedRunId(null);
    setTalonRun(null);
    resetTowerSep();
    setAccessRoad(null);
    setBuildingsFC(null);
    setBuildingStatus("loading");
    setClickMode(null);
    setDraftPoints([]);
    // Fire access road and mandatory building-footprint lookups in background.
    const centroidCoords = p.location?.coordinates || [p.geometry?.coordinates?.[0]?.[0]?.[0], p.geometry?.coordinates?.[0]?.[0]?.[1]];
    const buildingRequestId = ++buildingRequestRef.current;
    if (centroidCoords?.[0] && centroidCoords?.[1]) {
      scipExistingConditions({ lat: centroidCoords[1], lon: centroidCoords[0] })
        .then((res) => {
          const conditions = res?.data?.conditions || res?.conditions;
          if (conditions?.access_road) setAccessRoad(conditions.access_road);
        })
        .catch(() => {}); // non-blocking — never fails the siting
      regridBuildingFootprints({ lat: centroidCoords[1], lon: centroidCoords[0], radius_ft: 2500 })
        .then((res) => {
          if (buildingRequestRef.current !== buildingRequestId) return;
          setBuildingsFC(res?.data?.buildings || { type: "FeatureCollection", features: [] });
          setBuildingStatus("ready");
        })
        .catch((error) => {
          console.error("building footprint lookup failed:", error);
          if (buildingRequestRef.current === buildingRequestId) setBuildingStatus("error");
        });
    } else {
      setBuildingStatus("error");
    }
    if (p.state && p.jurisdiction) {
      try {
        const { data } = await towerSiterOrdinance({ state: p.state, jurisdiction: p.jurisdiction });
        setRules(data?.rules || null);
      } catch (e) { console.error("ordinance lookup failed:", e); setRules(null); }
    }
  }, [ent]);

  const handleLookup = async (mode, payload) => {
    setBusy(true);
    try {
      const { data } = await towerSiterParcel({ mode, ...payload });
      const parcels = (data?.parcels || []).filter((p) => p.geometry);
      if (!parcels.length) { toast.error("No parcel boundary found — try the plat upload or manual entry (Tier 2/3)."); return; }
      if (parcels.length === 1) await loadParcel(parcels[0], "realie");
      else setParcelOptions(parcels);
    } catch (e) {
      console.error(e);
      toast.error("Parcel lookup failed — try again.");
    } finally { setBusy(false); }
  };

  const handleMapClick = async (lonLat) => {
    if (clickMode === "parcel") {
      setBusy(true);
      try {
        const { data } = await towerSiterParcel({ mode: "location", lat: lonLat[1], lon: lonLat[0] });
        const parcels = (data?.parcels || []).filter((p) => p.geometry);
        const hit = parcels.find((p) => { try { return booleanPointInPolygon(point(lonLat), p.geometry.type ? { type: "Feature", properties: {}, geometry: p.geometry } : p.geometry); } catch { return false; } }) || parcels[0];
        if (!hit) { toast.error("No parcel found at that point."); return; }
        await loadParcel(hit, "realie");
      } finally { setBusy(false); }
    } else if (clickMode === "rectCenter" || (clickMode === "platAnchor" && pendingPlat?.method === "dimensions")) {
      const w = clickMode === "rectCenter" ? Number(manualRect.w) : pendingPlat.width_ft;
      const d = clickMode === "rectCenter" ? Number(manualRect.d) : pendingPlat.depth_ft;
      const frame = makeFrame(lonLat);
      const geom = compoundRect([0, 0], w, d, frame).lonLat.geometry;
      await loadParcel({
        geometry: geom, location: { type: "Point", coordinates: lonLat },
        apn: "MANUAL", ownerName: null, acres: Math.round((w * d / 43560) * 100) / 100,
        jurisdiction: null, state: null,
        sourceLabel: clickMode === "platAnchor" ? "FROM USER-SUPPLIED IMAGE — NOT A SURVEY" : "MANUAL ENTRY — NOT A SURVEY",
      }, clickMode === "platAnchor" ? "plat" : "manual");
      setPendingPlat(null);
    } else if (clickMode === "platAnchor" && pendingPlat?.method === "calls") {
      try {
        const { polygonFt, miscloseFt, warned } = polygonFromCalls(pendingPlat.calls);
        const frame = makeFrame(lonLat);
        const geom = polygonFromFrame(polygonFt, frame).geometry;
        const acres = Math.round((turfArea({ type: "Feature", properties: {}, geometry: geom }) / 4046.86) * 100) / 100;
        await loadParcel({
          geometry: geom, location: { type: "Point", coordinates: lonLat },
          apn: "PLAT", ownerName: null, acres, jurisdiction: null, state: null,
          calls: pendingPlat.calls,
          sourceLabel: "FROM USER-SUPPLIED IMAGE — NOT A SURVEY",
        }, "plat");
        if (warned) toast.warning(`Boundary misclosure of ${miscloseFt.toFixed(1)}′ was distributed (compass rule) — verify against the plat.`);
        toast.info("Reconstructed boundary shown — confirm it matches your plat before siting.");
        setPendingPlat(null);
      } catch (e) {
        console.error(e);
        toast.error(`Could not reconstruct the boundary: ${e.message}`);
      }
    } else if (clickMode === "polygon") {
      setDraftPoints((p) => [...p, lonLat]);
    }
  };

  const finishPolygon = async () => {
    if (draftPoints.length < 3) return;
    const ring = [...draftPoints, draftPoints[0]];
    const geom = { type: "Polygon", coordinates: [ring] };
    const acres = Math.round((turfArea({ type: "Feature", properties: {}, geometry: geom }) / 4046.86) * 100) / 100;
    await loadParcel({
      geometry: geom, location: { type: "Point", coordinates: draftPoints[0] },
      apn: "MANUAL", acres, jurisdiction: null, state: null,
      sourceLabel: "MANUAL ENTRY — NOT A SURVEY",
    }, "manual");
  };

  /* ---------------- tower drag — clamp inside parcel, live recompute ---------------- */
  const onTowerDrag = useCallback((lonLat) => {
    if (!result?.parcel) return;
    try {
      const candidate = point(lonLat);
      if (!booleanPointInPolygon(candidate, result.parcel)) return;
      if ((buildingsFC?.features || []).some((building) => booleanPointInPolygon(candidate, building))) {
        toast.error("Tower cannot be placed on a building.");
        return;
      }
    } catch { return; }
    setTowerOverride(lonLat);
  }, [result?.parcel, buildingsFC]);

  /* ---------------- residential + tower separation — fires ONCE on Confirm ---------------- */
  const confirmPlacement = async () => {
    if (!result || result.collapsed) return;

    const normalizedRules = normalizeOrdinanceRules(rules, Number(controls.heightFt) || 199);
    const effectiveRules = normalizedRules || rules;

    // 1. Residential separation
    const resSep = effectiveRules?.residential_separation_ft;
    const key = result.towerLonLat.map((v) => v.toFixed(5)).join(",");
    if (!resSep) {
      setResidential({ result: { status: "skip", label: "No residential separation rule on file" } });
    } else if (!(residential?.key === key && residential.result)) {
      setResidential({ key, loading: true });
      try {
        const { data } = await towerSiterResidential({ lat: result.towerLonLat[1], lon: result.towerLonLat[0], separationFt: resSep });
        const hits = data?.properties || [];
        setResidential({
          key,
          result: hits.length
            ? { status: "fail", label: `Residence within ${resSep}′`, offendingAddress: hits[0].address }
            : { status: "pass", label: `No residences within ${resSep}′` },
          circle: turfCircle(result.towerLonLat, resSep, { units: "feet", steps: 64 }),
        });
      } catch (e) {
        console.error(e);
        setResidential({ key, result: { status: "skip", label: "Residential check unavailable" } });
      }
    }

    // 2. Tower separation — fetch nearby towers + run check
    const towerSep = effectiveRules?.tower_separation_ft;
    await fetchTowers(result.towerLonLat[1], result.towerLonLat[0], towerSep, 2);

    // 3. Compute result classification (after checks are set — use current values)
    const rc = classifyResult(result.checks, [], buildingStatus === "ready");
    setResultClass(rc);

    // 4. TalonFit® certification + audit log (rate-limited server-side)
    try {
      const certified = getResultMeta(rc).feasible === true;
      const failedEntry = Object.entries(result.checks || {}).find(([, v]) => v?.status === "fail");
      const bindingConstraint = failedEntry
        ? (failedEntry[1]?.label || `${failedEntry[0]} check`)
        : (effectiveRules?.height_limit_ft != null
            ? `Ordinance height cap (${effectiveRules.height_limit_ft}′)`
            : "Fall-zone / property-line clearance");
      const { data: tf } = await talonfitRun({
        source: "tower_siter",
        parcel_id: parcel?.apn || null,
        latitude: result.towerLonLat[1],
        longitude: result.towerLonLat[0],
        jurisdiction: parcel?.jurisdiction || null,
        tower_height_ft: Number(controls.heightFt) || null,
        max_height_ft: Number(controls.heightFt) || null,
        binding_constraint: bindingConstraint,
        feasible: certified,
        result_class: rc,
      });
      setTalonRun({ run_id: tf?.run_id, certified });
    } catch (e) {
      if (e?.response?.status === 429) toast.error(e.response.data?.error || "TalonFit rate limit reached.");
      console.error("TalonFit audit log failed:", e);
    }
  };

  /* ---------------- save run to TowerSitingRun entity ---------------- */
  const saveRun = async () => {
    if (!result || result.collapsed || !parcel) return;
    setSavingRun(true);
    try {
      const centroid = turfCentroid(result.parcel).geometry.coordinates;
      const normalizedRules = normalizeOrdinanceRules(rules, Number(controls.heightFt) || 199);
      const effectiveRules = normalizedRules || rules;
      const rc = resultClass || classifyResult(result.checks, [], buildingStatus === "ready", result.collapsed);

      const payload = {
        parcel_id: parcel.apn || null,
        property_address: parcel.addressFull || parcel.parcel_address || null,
        parcel_geometry: result.parcel?.geometry || null,
        parcel_centroid_lat: centroid[1],
        parcel_centroid_lon: centroid[0],
        jurisdiction_name: parcel.jurisdiction || null,
        jurisdiction_rules: effectiveRules || null,
        zoning_source: rules ? "telecom_ordinances" : "unverified",
        zoning_confidence: rules ? "medium" : "unverified",
        ordinance_source_url: effectiveRules?.source_url || null,
        tower_height_ft: Number(controls.heightFt) || null,
        tower_type: "monopole",
        compound_width_ft: Number(controls.compoundW) || 75,
        compound_depth_ft: Number(controls.compoundD) || 75,
        pe_toggle: !!controls.peToggle,
        pe_radius_ft: controls.peRadiusFt ? Number(controls.peRadiusFt) : null,
        existing_towers_used: towerData?.towers || [],
        siting_result: {
          towerLonLat: result.towerLonLat,
          clearanceFt: liveSiting?.clearanceFt ?? result.clearanceFt,
          setback: result.setback,
          fallRadius: result.fallRadius,
          checks: result.checks,
          towerSeparation: separationCheck,
          verdict: liveSiting?.verdict || null,
          reasons: liveSiting?.reasons || [],
        },
        result_class: rc,
        feasible: liveSiting ? liveSiting.feasible : (!result.collapsed && Object.values(result.checks || {}).every((c) => c === true || c?.status !== "fail")),
        compound_geojson: result.compound?.lonLat?.geometry || null,
        fall_zone_geojson: result.checks?.fallZone?.circle?.geometry || null,
        candidate_area_geojson: result.envelope?.geometry || null,
        property_setback_geojson: setbackBandGeometry(result.parcel, result.envelope),
        conflict_layers_geojson: {
          type: "FeatureCollection",
          features: [
            ...(towerData?.buffers?.features || []),
            ...(residential?.circle ? [residential.circle] : []),
            ...(buildingsFC?.features || []),
          ],
        },
        tower_separation_geojson: towerData?.buffers || null,
        access_road_meta: accessRoad || null,
        status: "completed",
      };

      const saved = await base44.entities.TowerSitingRun.create(payload);
      setSavedRunId(saved?.id || null);
      toast.success("Siting run saved.");
    } catch (e) {
      console.error("saveRun error:", e);
      toast.error("Could not save the siting run.");
    } finally {
      setSavingRun(false);
    }
  };

  /* ---------------- exports ---------------- */
  const fileBase = `tower-siter-${(parcel?.apn || "site").toString().replace(/[^a-z0-9-]/gi, "_")}`;
  const exportA = async () => {
    if (!exhibitARef.current) { toast.error("Open the Plan Sheet view first."); return; }
    await svgToPngDownload(exhibitARef.current, `${fileBase}-exhibit-A.png`);
  };
  const exportPdf = async () => {
    if (!exhibitARef.current) { toast.error("Open the Plan Sheet view first."); return; }
    await svgToPdfDownload(exhibitARef.current, `${fileBase}-exhibit-A.pdf`);
  };
  const exportB = async () => {
    try {
      const cfg = await loadPublicConfig();
      await exportExhibitB({ token: cfg.mapboxAccessToken, result, watermark: ent.watermark, jurisdiction: parcel?.jurisdiction, filename: `${fileBase}-exhibit-B.png` });
    } catch (e) { toast.error(e.message); }
  };
  const sendToScip = async () => {
    if (!result || result.collapsed) return;
    const { data } = await towerSiterSitings({
      action: "insert",
      parcel_apn: parcel?.apn || null,
      state: parcel?.state || null,
      jurisdiction: parcel?.jurisdiction || null,
      geojson: {
        parcel: result.parcel.geometry,
        tower: { type: "Point", coordinates: result.towerLonLat },
        compound: result.compound.lonLat.geometry,
      },
      params: {
        tower_height_ft: Number(controls.heightFt),
        setback_ft: result.setback,
        fall_radius_ft: result.fallRadius,
        setback_rule_applied: result.peApplied ? "pe_engineered" : rules?.setback_rule || "1to1_unverified",
        pe: result.peApplied,
        compound: { w: Number(controls.compoundW), d: Number(controls.compoundD) },
      },
      checks: {
        height: result.checks?.height?.status,
        setback: result.checks?.setback?.status,
        fall_zone: result.checks?.fallZone?.status,
        compound: result.checks?.compound?.status,
        residential: residential?.result?.status || "not_run",
      },
    });
    if (data?.ok) toast.success("Siting saved — available to the SCIP pipeline.");
    else toast.error(data?.error || "Save failed.");
  };

  const exhibitMeta = {
    jurisdiction: parcel?.jurisdiction, apn: parcel?.apn, ownerName: parcel?.ownerName,
    acres: parcel?.acres, calls: parcel?.calls, sourceLabel: parcel?.sourceLabel,
  };

  // Active Target A for the HawkFit section below — derived from the loaded
  // parcel in ScipRecord.parcel_targets shape so the shared resolver order holds.
  const hawkFitTarget = useMemo(() => {
    const c = parcel?.location?.coordinates;
    if (!c || !Number.isFinite(Number(c[1])) || !Number.isFinite(Number(c[0]))) return null;
    return {
      parcel_address: parcel.addressFull || null,
      apn: parcel.apn || null,
      owner_name: parcel.ownerName || null,
      acreage: parcel.acres ?? null,
      zoning_classification: parcel.zoningCode || null,
      jurisdiction: parcel.jurisdiction || null,
      latitude: Number(c[1]),
      longitude: Number(c[0]),
    };
  }, [parcel]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground flex items-center gap-2">
            <Layers className="w-6 h-6 text-blue-500" /> Tower Siter
          </h1>
          <p className="text-sm text-muted-foreground">Compliant tower placement on any parcel — setbacks, fall zone, compound fit. {ent.label} plan.</p>
        </div>
        {ent.batch && (
          <Button size="sm" variant="outline" disabled title="Phase 2">Batch site from scan — Phase 2</Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[350px,1fr] gap-4">
        {/* left rail */}
        <div className="space-y-3 rounded-2xl bg-[#0C1B2E] border border-white/10 p-3">
          <ParcelInputPanel
            ent={ent} busy={busy} clickMode={clickMode} setClickMode={setClickMode}
            onLookup={handleLookup}
            onUseDemo={() => loadParcel(DEMO_PARCEL, "demo")}
            onPlatParsed={(p) => { setPendingPlat(p); setClickMode("platAnchor"); }}
            parcelOptions={parcelOptions}
            onPickOption={(i) => loadParcel(parcelOptions[i], "realie")}
            manualRect={manualRect} setManualRect={setManualRect}
            onFinishPolygon={finishPolygon} draftCount={draftPoints.length}
          />

          {parcel && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60 space-y-0.5">
              <div className="font-heading font-bold text-white text-sm">{parcel.addressFull || parcel.apn || "Parcel"}</div>
              <div>APN <b className="text-white/85">{parcel.apn || "—"}</b> · {parcel.acres ? `${parcel.acres} ac` : "—"} · {parcel.zoningCode || ""}</div>
              {parcel.ownerName && <div>Owner: <b className="text-white/85">{parcel.ownerName}</b></div>}
              {parcel.legalDesc && <div className="text-white/40 line-clamp-2">{parcel.legalDesc}</div>}
              {parcel.sourceLabel && <div className="text-amber-400 font-bold">{parcel.sourceLabel}</div>}
              {result?.ambiguousParcel && <div className="text-amber-300">Multi-part parcel — largest part used.</div>}
            </div>
          )}

          {parcel && <RuleCard rules={rules} jurisdiction={parcel.jurisdiction} unverified={result?.unverified} />}

          {parcel && (
            <SitingDeepDive
              parcel={parcel}
              anonKey={anonKey}
              onResult={(r) => { setSitingResult(r); }}
            />
          )}

          <SiterControls controls={controls} onChange={setControls} rules={rules} peAllowedByTier={ent.peAllowed} />

          {result && !result.collapsed && (
            <div className="space-y-2">
              <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-500" onClick={confirmPlacement} disabled={towerSepLoading}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> {towerSepLoading ? "Checking towers…" : "Confirm placement"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" className="border-white/15 text-white/70" onClick={exportA}
                  disabled={sitingResult && !sitingResult.feasible}>
                  <Download className="w-3.5 h-3.5 mr-1" /> Exhibit A
                </Button>
                <Button size="sm" variant="outline" className="border-white/15 text-white/70" onClick={exportB}
                  disabled={sitingResult && !sitingResult.feasible}>
                  <Download className="w-3.5 h-3.5 mr-1" /> Exhibit B
                </Button>
              </div>
              <Button size="sm" variant="outline" className="w-full border-white/15 text-white/70" onClick={exportPdf}
                disabled={sitingResult && !sitingResult.feasible}>
                <Printer className="w-3.5 h-3.5 mr-1" /> Print Exhibit A — PDF
              </Button>
              <Button size="sm" variant="outline" className="w-full border-white/15 text-white/70" onClick={saveRun}
                disabled={savingRun}>
                <Save className="w-3.5 h-3.5 mr-1" /> {savingRun ? "Saving…" : "Save Run"}
              </Button>
              {/* TURTLE UP: ships dark behind HAWKPRO_EXPORT flag (renders null until approved) */}
              <ExportHawkProButton parcel={parcel} result={result} controls={controls} rules={rules} />
              <Generate3DImageButton result={result} runId={savedRunId} controls={controls} parcel={parcel} />
              <GeneratePhoto3DButton
                result={result}
                controls={controls}
                parcel={parcel}
                rules={rules}
                sitingRun={{
                  id: savedRunId,
                  tower_height_ft: Number(controls.heightFt) || 199,
                  tower_type: "monopole",
                  compound_width_ft: Number(controls.compoundW) || 75,
                  compound_depth_ft: Number(controls.compoundD) || 75,
                  jurisdiction_name: parcel?.jurisdiction || null,
                  result_class: resultClass || null,
                  feasible: !result.collapsed,
                  parcel_geometry: result.parcel?.geometry || null,
                  candidate_area_geojson: result.envelope?.geometry ? { type: "Feature", geometry: result.envelope.geometry } : null,
                  compound_geojson: result.compound?.lonLat?.geometry ? { type: "Feature", geometry: result.compound.lonLat.geometry } : null,
                  fall_zone_geojson: result.checks?.fallZone?.circle?.geometry ? { type: "Feature", geometry: result.checks.fallZone.circle.geometry } : null,
                  conflict_layers_geojson: null,
                }}
              />
              <Button size="sm" variant="outline" className="w-full border-white/15 text-white/70" onClick={sendToScip}
                disabled={sitingResult && !sitingResult.feasible}>
                <Send className="w-3.5 h-3.5 mr-1" /> Send to SCIP
              </Button>
            </div>
          )}
        </div>

        {/* right — map / plan sheet */}
        <div className="space-y-3">
          {parcel && buildingStatus === "loading" && (
            <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-3 text-sm text-cyan-200 font-semibold">Checking building footprints before placing the tower…</div>
          )}
          {parcel && buildingStatus === "error" && (
            <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300 font-semibold">Building footprints could not be verified, so Tower Siter has blocked placement on this parcel.</div>
          )}
          {result?.collapsed && (
            <>
              <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300 flex items-center gap-2 font-semibold">
                <AlertOctagon className="w-5 h-5 shrink-0" />
                {result.banner || "No compliant placement at this height — try PE letter or shorter tower."}
              </div>
              <FeasibilityFinder
                parcelGeoJSON={parcel.geometry}
                locationPoint={parcel.location?.coordinates || null}
                rules={rules}
                controls={controls}
                buildingsFC={buildingsFC}
                peAllowed={ent.peAllowed}
                onApply={(patch) => { setTowerOverride(null); setControls((c) => ({ ...c, ...patch })); }}
              />
            </>
          )}

          {result && !result.collapsed && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-start gap-2">
              <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>
                <b>Proposed location only.</b> This siting is an auto-generated estimate and may not satisfy all requirements of the local governing authority. Verify setbacks, height limits, fall zones, and compound dimensions with your jurisdiction before submission.
              </span>
            </div>
          )}

          {result && !result.collapsed && (
            <LiveSitingVerdict
              live={liveSiting}
              jurisdiction={parcel?.jurisdiction}
              rules={normalizeOrdinanceRules(rules, Number(controls.heightFt) || 199) || rules}
              unverified={result.unverified}
            />
          )}

          {result && !result.collapsed && (
            <ComplianceChips
              checks={result.checks}
              residential={residential}
              residentialAllowed={ent.residentialCheck}
              towerSeparation={separationCheck}
              towerSeparationLoading={towerSepLoading}
            />
          )}

          {result && !result.collapsed && separationCheck && (
            <SitingResultPanel
              result={result}
              resultClass={resultClass}
              checks={{ ...result.checks, towerSeparation: separationCheck }}
              towerSeparation={separationCheck}
              residential={residential}
              warnings={[
                "Mapped building footprints were excluded from tower and compound placement.",
                "Preliminary automated siting exhibit only. Final placement must be verified by surveyor, engineer, and jurisdictional review.",
              ]}
              rules={normalizeOrdinanceRules(rules, Number(controls.heightFt) || 199) || rules}
            />
          )}

          {result && !result.collapsed && talonRun?.certified && (
            <TalonFitCertifiedBadge runId={talonRun.run_id} />
          )}

          <div className="flex gap-2">
            <Button size="sm" variant={view === "map" ? "default" : "outline"} onClick={() => setView("map")}>
              <Layers className="w-4 h-4 mr-1" /> Map View
            </Button>
            <Button size="sm" variant={view === "plan" ? "default" : "outline"} onClick={() => setView("plan")} disabled={!result || result.collapsed}>
              <FileText className="w-4 h-4 mr-1" /> Plan Sheet (Exhibit A)
            </Button>
          </div>

          {view === "map" && (
            <>
              <SiterMap
                parcelGeoJSON={parcel?.geometry || null}
                result={result}
                liveSiting={liveSiting}
                leaseLonLat={leaseLonLat}
                residCircle={residential?.circle || null}
                towerData={towerData}
                buildingsFC={buildingsFC}
                draftPoints={draftPoints}
                onTowerDrag={onTowerDrag}
                onMapClick={handleMapClick}
                clickMode={clickMode}
                rowData={accessRoad}
              />
              {accessRoad && (
                <div className="mt-2 px-3 py-2 rounded-lg text-xs flex items-start gap-2" style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.35)", color: "#f97316" }}>
                  <span className="text-base leading-none">🛣️</span>
                  <div>
                    <span className="font-semibold">{accessRoad.road_name}</span>
                    <span className="opacity-75"> · {accessRoad.highway_label} · {accessRoad.ownership} · ~{accessRoad.distance_ft} ft</span>
                    <div className="opacity-80 mt-0.5">{accessRoad.permit_path}</div>
                  </div>
                </div>
              )}
            </>
          )}

          {view === "plan" && result && !result.collapsed && (
            <ExhibitA ref={exhibitARef} result={result} controls={controls} meta={exhibitMeta} watermark={ent.watermark} />
          )}
          {/* keep ExhibitA mounted (hidden) so exports always work */}
          {view !== "plan" && result && !result.collapsed && (
            <div className="hidden" aria-hidden="true">
              <ExhibitA ref={exhibitARef} result={result} controls={controls} meta={exhibitMeta} watermark={ent.watermark} />
            </div>
          )}
        </div>
      </div>

      {/* HAWKFIT MAP — immediately after the Tower Siter / Preliminary Tower
          Siting Exhibit. Deterministic fit checks + Save Scenario / Export Map
          on the SAME parcel loaded above. */}
      {hawkFitTarget && (
        <HawkFitPipelineSection
          unlocked={true}
          targetA={hawkFitTarget}
          towerHeightFt={Number(controls.heightFt) || 199}
        />
      )}

      {/* NLCD LAND COVER + IMPERVIOUS SURFACE — directly beneath HawkFit Map,
          centered on the SAME active Target A. */}
      {hawkFitTarget && (
        <NlcdLandCoverSection unlocked={true} targetA={hawkFitTarget} />
      )}

      {/* TERRAIN EXPLORER — the LAST map, centered on the SAME active Target A,
          with basemap-style "looks" toggles + optional 3D terrain. */}
      {hawkFitTarget && (
        <TerrainMapSection unlocked={true} targetA={hawkFitTarget} />
      )}

      <UpgradeModal open={!!upgrade} onClose={() => setUpgrade(null)} reason={upgrade} />
    </div>
  );
}