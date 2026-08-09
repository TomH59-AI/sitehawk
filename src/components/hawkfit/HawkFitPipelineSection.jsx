import { useState, useEffect, useMemo, useCallback } from "react";
import { distance as turfDistance } from "@turf/turf";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Sparkles, ChevronDown, ChevronUp, Save, Loader2, Copy, KeyRound, Eraser, BadgeCheck, X } from "lucide-react";
import { talonfitSelectionCode } from "@/functions/talonfitSelectionCode";
import { useToast } from "@/components/ui/use-toast";
import { computeFit, autoPlaceTower } from "@/lib/hawkfitGeometry";
import { buildOrdinanceRules, evaluatePoint, COLOR_HEX } from "@/lib/aiEquation";
import { recordShadow, ringFromGeometry } from "@/lib/solverShadow";
import "@/lib/shadowPersist";
import { resolveActiveTargetA, resolve3DContext } from "@/lib/hawkfitTargetResolver";
import { lookupRealieProperty } from "@/functions/lookupRealieProperty";
import { saveTowerScenario } from "@/functions/saveTowerScenario";
import { hawkfitWaterBodies } from "@/functions/hawkfitWaterBodies";
import { regridBuildingFootprints } from "@/functions/regridBuildingFootprints";
import { towerSiterNearbyTowers } from "@/functions/towerSiterNearbyTowers";
import HawkFitMap from "@/components/hawkfit/HawkFitMap";
import PropertyLookupForm from "@/components/hawkfit/PropertyLookupForm";
import SiteTargetSummary from "@/components/hawkfit/SiteTargetSummary";
import TowerControls from "@/components/hawkfit/TowerControls";
import FitStatusPanel from "@/components/hawkfit/FitStatusPanel";
import LayerTogglePanel from "@/components/hawkfit/LayerTogglePanel";
import ExportMapButton from "@/components/hawkfit/ExportMapButton";
import Preview3DButton from "@/components/hawkfit/Preview3DButton";
import HawkPerchTargetPicker from "@/components/hawkfit/HawkPerchTargetPicker";
import AIEquationPanel from "@/components/hawkfit/AIEquationPanel";

const stripEmpty = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== ""));

// The customer-pick exploration ring. SiteHawk selects A/B/C; inside this ring
// the subscriber grades and selects D/E/F himself — unlimited looks, three
// saves. The backend solver enforces the same 2-mile cap (MAX_RING_RADIUS_MILES).
const RING_MILES = 2;
const SLOT_LETTERS = ["D", "E", "F"];

async function loadConstraintData(target) {
  const [waterResult, structuresResult, towersResult] = await Promise.allSettled([
    hawkfitWaterBodies({ lat: target.latitude, lon: target.longitude }),
    regridBuildingFootprints({ lat: target.latitude, lon: target.longitude, radius_ft: 2500 }),
    towerSiterNearbyTowers({ lat: target.latitude, lon: target.longitude, radius_miles: 5 }),
  ]);
  return {
    water: waterResult.status === "fulfilled" ? waterResult.value?.data?.water || null : null,
    structures: structuresResult.status === "fulfilled" ? structuresResult.value?.data?.buildings?.features || [] : [],
    structureDataAvailable: structuresResult.status === "fulfilled",
    nearbyTowers: towersResult.status === "fulfilled" ? towersResult.value?.data?.towers || [] : [],
    towerDataAvailable: towersResult.status === "fulfilled",
  };
}

// HawkFit Map — pipeline-embedded section, mounted AFTER the Tower Siter /
// Preliminary Tower Siting Exhibit. Consumes the SAME active Target A as the
// SCIP pipeline (ScipRecord.parcel_targets → SearchResult → TowerSitingRun →
// TowerVisualization → Tower3DRender) and runs deterministic turf fit checks.
export default function HawkFitPipelineSection({ unlocked, targetA, towerHeightFt, savedTargets = [], onSaveTarget, onClearTarget, onRunTarget, zoningResult = null, searchCenter = null, searchRing = null }) {
  const { toast, dismiss } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [rejectedPoint, setRejectedPoint] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [siteTarget, setSiteTarget] = useState(null);
  const [resolvedFrom, setResolvedFrom] = useState(null);
  const [towerLngLat, setTowerLngLat] = useState(null);
  const [controls, setControls] = useState({ heightFt: 199, widthFt: 100, depthFt: 100 });
  const [layers, setLayers] = useState({ parcel: true, fallZone: true, compound: true });
  const [savedScenario, setSavedScenario] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [threeD, setThreeD] = useState(null);
  // Exploration probes — every spot the subscriber has graded this session.
  const [probes, setProbes] = useState([]);
  // One-time selection code, minted when Target F lands.
  const [selectionCode, setSelectionCode] = useState(null);
  const [certifyOpen, setCertifyOpen] = useState(false);
  const [certifyBusy, setCertifyBusy] = useState(false);
  const [certifyDone, setCertifyDone] = useState(false);
  const [certifyError, setCertifyError] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [water, setWater] = useState(null); // water-body FeatureCollection near the target
  const [structures, setStructures] = useState([]);
  const [structureDataAvailable, setStructureDataAvailable] = useState(false);
  const [nearbyTowers, setNearbyTowers] = useState([]);
  const [towerDataAvailable, setTowerDataAvailable] = useState(false);
  const [aiOverlay, setAiOverlay] = useState(null); // AI Equation buildable-area FeatureCollection

  // Refresh whenever the pipeline's active Target A changes (Target promotion /
  // active_target_index advance flows through the targetA prop coordinates).
  const targetKey = targetA ? `${targetA.latitude},${targetA.longitude}` : "none";
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    (async () => {
      setResolving(true);
      setSavedScenario(null);
      const res = await resolveActiveTargetA({ pipelineTarget: targetA });
      if (cancelled) return;
      let t = res?.target || null;
      // Realie geometry fallback — key stays backend-only.
      if (t && !t.parcel_geometry) {
        try {
          const { data } = await lookupRealieProperty({ lat: t.latitude, lon: t.longitude });
          if (data?.target) {
            t = { ...data.target, ...stripEmpty(t), parcel_geometry: data.target.parcel_geometry || null, id: data.target.id };
          }
        } catch { /* stays needs_review without geometry */ }
      }
      if (cancelled) return;
      setSiteTarget(t);
      setResolvedFrom(res?.source || null);
      setResolving(false);
      if (t) {
        // Load all spatial constraints before placing or approving a tower point.
        const constraintData = await loadConstraintData(t);
        if (cancelled) return;
        setWater(constraintData.water);
        setStructures(constraintData.structures);
        setStructureDataAvailable(constraintData.structureDataAvailable);
        setNearbyTowers(constraintData.nearbyTowers);
        setTowerDataAvailable(constraintData.towerDataAvailable);
        let placed = [t.longitude, t.latitude];
        if (t.parcel_geometry) {
          const auto = autoPlaceTower({
            parcelGeometry: t.parcel_geometry,
            heightFt: controls.heightFt, widthFt: controls.widthFt, depthFt: controls.depthFt,
            zoning: t.zoning || null, waterFeatures: constraintData.water,
          });
          if (auto?.lngLat) placed = auto.lngLat;
        }
        setTowerLngLat(placed);
        resolve3DContext(t).then((ctx) => { if (!cancelled) setThreeD(ctx); });
      } else {
        setWater(null);
        setStructures([]);
        setStructureDataAvailable(false);
        setNearbyTowers([]);
        setTowerDataAvailable(false);
        setTowerLngLat(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, targetKey]);

  // One rule set drives the cursor, map verdict, rejection reason, and saved height.
  const aiRules = useMemo(() => buildOrdinanceRules(zoningResult), [zoningResult]);
  const solverRules = useMemo(() => {
    const heightRule = aiRules.find((rule) => rule.category === "height");
    const setbackRule = aiRules.find((rule) => rule.category === "setback");
    return {
      maxHeightFt: heightRule?.maxHeightFt || 199,
      fixedSetbackFt: setbackRule?.fixedSetbackFt || 0,
      hasPELetter: !!setbackRule?.peReductionAllowed,
      fallZoneMultiplier: setbackRule?.peMultiplier ?? 0.5,
    };
  }, [aiRules]);

  const evaluateFitAt = useCallback((lngLat) => {
    if (!lngLat) return null;
    const physical = computeFit({
      parcelGeometry: siteTarget?.parcel_geometry || null,
      towerLngLat: lngLat,
      heightFt: controls.heightFt,
      widthFt: controls.widthFt,
      depthFt: controls.depthFt,
      zoning: siteTarget?.zoning || null,
      waterFeatures: water,
      frontSetbackFt: solverRules.fixedSetbackFt,
      sideSetbackFt: solverRules.fixedSetbackFt,
      rearSetbackFt: solverRules.fixedSetbackFt,
      maxHeightFt: solverRules.maxHeightFt,
      hasPELetter: solverRules.hasPELetter,
      fallZoneMultiplier: solverRules.fallZoneMultiplier,
    });
    // SHADOW MODE — v2 alongside the live engine, identical rule values, live
    // result untouched. See src/lib/solverShadow.ts.
    recordShadow({
      surface: "HawkFitPipeline",
      parcelRing: ringFromGeometry(siteTarget?.parcel_geometry),
      towerLngLat: lngLat,
      proposedHeightFt: controls.heightFt,
      liveResult: physical,
      jurisdiction: zoningResult?._registry?.jurisdiction || siteTarget?.county || null,
      ordinance: zoningResult?._registry || null,
      setbacks: {
        front: solverRules.fixedSetbackFt,
        side: solverRules.fixedSetbackFt,
        rear: solverRules.fixedSetbackFt,
      },
      maxHeightFt: solverRules.maxHeightFt,
      fallZone: {
        mode: "percent",
        value: solverRules.hasPELetter
          ? Math.min(0.9, Math.max(0.1, solverRules.fallZoneMultiplier))
          : 1,
      },
    });

    const ordinance = evaluatePoint({
      parcelGeometry: siteTarget?.parcel_geometry || null,
      towerLngLat: lngLat,
      requestedHeightFt: controls.heightFt,
      rules: aiRules,
      waterFeatures: water,
      nearbyTowers,
      towerDataAvailable,
      structures,
      structureDataAvailable,
      usePeReduction: solverRules.hasPELetter,
      carrierCenter: searchCenter,
      targetA,
    });
    const status = physical.status === "fails" || ordinance.color === "red"
      ? "fails"
      : physical.status === "needs_review" || ordinance.color === "yellow"
        ? "needs_review"
        : "works";
    const ceilings = [physical.maxAvailableHeight, ordinance.maxAllowedHeightFt]
      .filter((value) => Number.isFinite(value) && value >= 0);
    const maxAvailableHeight = ceilings.length ? Math.min(...ceilings) : 0;
    const reasons = [...new Set([
      ...ordinance.failing,
      ...physical.reasons,
      ...ordinance.conditional,
      ...ordinance.missing,
      ...ordinance.passing,
    ].filter(Boolean))];
    return {
      ...physical,
      status,
      errorCode: physical.errorCode || (ordinance.color === "red" ? "ERR_ORDINANCE" : ordinance.color === "yellow" ? "VERIFY" : null),
      reasons,
      maxAvailableHeight,
      aiEvaluation: ordinance,
    };
  }, [siteTarget, controls, water, solverRules, aiRules, nearbyTowers, towerDataAvailable, structures, structureDataAvailable, searchCenter, targetA]);

  const fit = useMemo(() => evaluateFitAt(towerLngLat), [evaluateFitAt, towerLngLat]);
  const aiEval = fit?.aiEvaluation || null;
  const handleTowerMove = useCallback((lngLat) => setTowerLngLat(lngLat), []);

  const getRingCenter = useCallback(() => {
    const src = searchRing || searchCenter;
    const lat = Number(src?.lat);
    const lon = Number(src?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }, [searchRing, searchCenter]);

  // Grade any coordinate in the ring with the backend solver — it resolves the
  // parcel at that point via Realie and applies the jurisdiction rules, so the
  // subscriber can explore parcels far beyond Target A.
  const solvePoint = useCallback(async (point) => {
    const center = getRingCenter();
    const { data } = await base44.functions.invoke("talonfitAiSolve", {
      lat: point.lat,
      lon: point.lng,
      center_lat: center?.lat,
      center_lon: center?.lon,
      requested_height_ft: controls.heightFt,
      compound_width_ft: controls.widthFt,
      compound_depth_ft: controls.depthFt,
      saved_count: savedTargets.filter(Boolean).length,
    });
    const r = data?.calculated_result || {};
    const p = data?.parcel || null;
    const d = data?.parcel_details || null;
    const optimal = data?.candidate_point || { latitude: point.lat, longitude: point.lng };
    return {
      lat: Number(optimal.latitude),
      lng: Number(optimal.longitude),
      requested_lat: point.lat,
      requested_lng: point.lng,
      moved_to_optimal: !!data?.optimal_location?.moved_from_click,
      status: r.decision === "APPROVED" ? "works" : r.decision === "VERIFY" ? "verify" : "fails",
      maxHeight: Number.isFinite(Number(r.maximum_buildable_height_ft)) ? Number(r.maximum_buildable_height_ft) : null,
      reason: r.reasons?.[0] || null,
      reasons: [...(r.reasons || []), ...(r.missing_information || []).map((item) => `DATA REQUIRED: ${item}`)],
      binding_constraint: r.binding_constraint || null,
      parcel_address: p?.address || "",
      apn: p?.parcel_id || "",
      owner_name: d?.owner || "",
      acreage: d?.acreage ?? null,
      zoning: p?.zoning_classification || d?.zoning || "",
      jurisdiction: p?.jurisdiction || "",
      approval_path: data?.ordinance_rules?.approval_path || "",
      ordinance_section: data?.ordinance_rules?.ordinance_section || "",
      ordinance_source_url: data?.ordinance_rules?.ordinance_source_url || "",
      wetlands_count: data?.spatial_constraints?.wetland_features?.features?.length || 0,
      solved_at: data?.solved_at || null,
      parcel_geometry: p?.geometry || null,
    };
  }, [getRingCenter, controls.heightFt, controls.widthFt, controls.depthFt, savedTargets]);

  // SINGLE CLICK — grade the spot. Green tower = works (max height + coords),
  // red = why it won't. Never consumes a save slot; unlimited looks.
  const handleMapProbe = useCallback(async (point) => {
    const center = getRingCenter();
    if (!center) {
      toast({ title: "No search ring", description: "The search-ring center is unavailable, so the two-mile limit cannot be verified.", variant: "destructive" });
      return;
    }
    const miles = turfDistance([point.lng, point.lat], [center.lon, center.lat], { units: "miles" });
    if (miles > RING_MILES) {
      toast({ title: "Outside the ring", description: `That spot is ${miles.toFixed(2)} miles out — your picks are limited to the two-mile SiteSitter™ ring.`, variant: "destructive" });
      return;
    }
    const id = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
    setProbes((prev) => [...prev.filter((x) => x.id !== id).map((x) => ({ ...x, openPopup: false })), { id, ...point, status: "pending" }]);
    try {
      const graded = await solvePoint(point);
      setProbes((prev) => prev.map((x) => (x.id === id ? { ...x, ...graded, openPopup: true } : x)));
    } catch (e) {
      setProbes((prev) => prev.map((x) => (x.id === id ? { ...x, status: "verify", reason: e?.response?.data?.error || e.message || "Solver failed — try that spot again.", openPopup: true } : x)));
    }
  }, [getRingCenter, solvePoint, toast]);

  // DOUBLE CLICK — save a green spot as Target D, E or F. Three maximum.
  // The third save mints the one-time selection code.
  const handleMapSelect = useCallback(async (point) => {
    const slot = savedTargets.findIndex((target) => !target);
    if (slot === -1) {
      toast({ title: "All three saved", description: "Targets D, E and F are full. Keep exploring with single clicks, or hit Clear to start a fresh set." });
      return;
    }
    const center = getRingCenter();
    if (!center) {
      const reason = "Search-ring center is unavailable, so the two-mile limit cannot be verified.";
      setRejectedPoint({ ...point, reason });
      toast({ title: "REJECTED", description: reason, variant: "destructive" });
      return;
    }
    const miles = turfDistance([point.lng, point.lat], [center.lon, center.lat], { units: "miles" });
    if (miles > RING_MILES) {
      const reason = `Outside the two-mile SiteSitter™ ring (${miles.toFixed(2)} miles from center).`;
      setRejectedPoint({ ...point, reason });
      toast({ title: "REJECTED", description: reason, variant: "destructive" });
      return;
    }

    // Reuse a green probe already graded at (essentially) this spot; otherwise
    // grade it now — a save must never bypass the solver.
    let graded = probes.find((x) => x.status === "works" && turfDistance([x.lng, x.lat], [point.lng, point.lat], { units: "miles" }) < 0.023);
    if (!graded) {
      try {
        graded = { ...point, ...(await solvePoint(point)) };
      } catch (e) {
        const reason = e?.response?.data?.error || e.message || "Solver failed — try again.";
        setRejectedPoint({ ...point, reason });
        toast({ title: "REJECTED", description: reason, variant: "destructive" });
        return;
      }
    }
    if (graded.status !== "works") {
      const reason = graded.reason || "The selected parcel does not meet the SiteSitter™ requirements.";
      setRejectedPoint({ ...point, reason });
      toast({ title: "REJECTED", description: reason, variant: "destructive" });
      return;
    }

    const maxHeightFt = Math.floor(graded.maxHeight ?? 0);
    const savedPoint = {
      lat: graded.lat ?? point.lat,
      lng: graded.lng ?? point.lng,
      max_height_ft: maxHeightFt,
      tower_height_ft: maxHeightFt ? Math.min(controls.heightFt, maxHeightFt) : controls.heightFt,
      pe_letter_required: solverRules.hasPELetter,
      distance_from_ring_center_miles: miles,
      decision_status: "approved",
      parcel_address: graded.parcel_address || "",
      apn: graded.apn || "",
      owner_name: graded.owner_name || "",
      binding_constraint: graded.binding_constraint || graded.reason || null,
      acreage: graded.acreage ?? null,
      zoning: graded.zoning || "",
      jurisdiction: graded.jurisdiction || "",
      approval_path: graded.approval_path || "",
      ordinance_section: graded.ordinance_section || "",
      ordinance_source_url: graded.ordinance_source_url || "",
      wetlands_count: graded.wetlands_count || 0,
      moved_to_optimal: !!graded.moved_to_optimal,
    };
    setRejectedPoint(null);
    onSaveTarget?.(slot, savedPoint);
    toast({
      title: `Target ${SLOT_LETTERS[slot]} approved and saved`,
      description: `${savedPoint.lat.toFixed(6)}, ${savedPoint.lng.toFixed(6)} · maximum ${maxHeightFt} ft`,
    });

    // Target F just landed — mint the one-time code. The customer picked all
    // three himself; the code is the receipt that goes where his name would.
    const nextSaved = [...savedTargets];
    nextSaved[slot] = savedPoint;
    if (nextSaved.every(Boolean)) {
      try {
        const { data } = await talonfitSelectionCode({
          action: "issue",
          site_key: `${center.lat.toFixed(5)},${center.lon.toFixed(5)}`,
          ring_center: center,
          targets: nextSaved.map((t) => ({ lat: t.lat, lng: t.lng, max_height_ft: t.max_height_ft, parcel_address: t.parcel_address, apn: t.apn })),
        });
        if (data?.code) setSelectionCode({ code: data.code, status: "issued", targets: nextSaved });
      } catch (e) {
        toast({ title: "Code could not be issued", description: e?.response?.data?.error || e.message, variant: "destructive" });
      }
    }
  }, [savedTargets, probes, getRingCenter, solvePoint, controls.heightFt, solverRules.hasPELetter, onSaveTarget, toast]);

  const handleClearAll = useCallback(() => {
    setProbes([]);
    setRejectedPoint(null);
    savedTargets.forEach((target, index) => target && onClearTarget?.(index));
  }, [savedTargets, onClearTarget]);

  const handleRedeem = useCallback(async () => {
    setCertifyBusy(true);
    setCertifyError("");
    try {
      const center = getRingCenter();
      const picks = (selectionCode?.targets || savedTargets).filter(Boolean);
      const { data } = await talonfitSelectionCode({
        action: "redeem",
        code: codeInput,
        certification: {
          ring_center: center,
          jurisdiction: zoningResult?._registry?.jurisdiction || null,
          targets: picks.map((t, i) => ({ letter: SLOT_LETTERS[i], lat: t.lat, lon: t.lng, max_height_ft: t.max_height_ft, parcel_address: t.parcel_address || null })),
          certified_at: new Date().toISOString(),
        },
      });
      if (data?.error) throw new Error(data.error);
      setCertifyDone(true);
      setSelectionCode((s) => (s ? { ...s, status: "redeemed" } : s));
    } catch (e) {
      setCertifyError(e?.response?.data?.error || e.message || "Redemption failed.");
    } finally {
      setCertifyBusy(false);
    }
  }, [getRingCenter, selectionCode, savedTargets, codeInput, zoningResult]);

  // Manual lookup stays available but never replaces the pipeline order —
  // the section re-resolves from the pipeline whenever Target A changes.
  const handleManualLookup = async (query) => {
    setManualBusy(true);
    try {
      const { data } = await lookupRealieProperty(query);
      const t = data.target;
      setSiteTarget(t);
      setResolvedFrom("manual lookup");
      setSavedScenario(null);
      const constraintData = await loadConstraintData(t);
      setWater(constraintData.water);
      setStructures(constraintData.structures);
      setStructureDataAvailable(constraintData.structureDataAvailable);
      setNearbyTowers(constraintData.nearbyTowers);
      setTowerDataAvailable(constraintData.towerDataAvailable);
      let placed = [t.longitude, t.latitude];
      if (t.parcel_geometry) {
        const auto = autoPlaceTower({
          parcelGeometry: t.parcel_geometry,
          heightFt: controls.heightFt, widthFt: controls.widthFt, depthFt: controls.depthFt,
          zoning: t.zoning || null, waterFeatures: constraintData.water,
        });
        if (auto?.lngLat) placed = auto.lngLat;
      }
      setTowerLngLat(placed);
      resolve3DContext(t).then(setThreeD);
    } catch (e) {
      toast({ title: "Lookup failed", description: e?.response?.data?.error || e.message, variant: "destructive" });
    }
    setManualBusy(false);
  };

  const handleSave = async () => {
    setSaveBusy(true);
    try {
      const { data } = await saveTowerScenario({
        site_target: siteTarget,
        scenario: {
          id: savedScenario?.id,
          name: siteTarget.address || siteTarget.parcel_id || "Target A Tower Scenario",
          tower_lat: towerLngLat[1],
          tower_lon: towerLngLat[0],
          tower_height_ft: controls.heightFt,
          compound_width_ft: controls.widthFt,
          compound_depth_ft: controls.depthFt,
          fit_status: fit.status,
          fit_reasons: fit.reasons,
          hawkperch_error_code: fit.errorCode || undefined,
          edge_distance_ft: fit.edgeDistanceFt ?? undefined,
          max_available_height_ft: fit.maxAvailableHeight ?? undefined,
          hawkperch_config: {
            front_setback_ft: solverRules.fixedSetbackFt,
            side_setback_ft: solverRules.fixedSetbackFt,
            rear_setback_ft: solverRules.fixedSetbackFt,
            max_height_ft: solverRules.maxHeightFt,
            has_pe_letter: solverRules.hasPELetter,
            fall_zone_multiplier: solverRules.hasPELetter ? solverRules.fallZoneMultiplier : 1,
          },
        },
        fit: { status: fit.status, reasons: fit.reasons },
      });
      setSiteTarget((t) => ({ ...t, id: data.siteTarget.id }));
      setSavedScenario(data.scenario);
      toast({ title: "Scenario saved", description: "Export Map is now enabled." });
    } catch (e) {
      toast({ title: "Save failed", description: e?.response?.data?.error || e.message, variant: "destructive" });
    }
    setSaveBusy(false);
  };

  if (!unlocked) return null;

  return (
    <div
      id="talonfit-ai"
      className="relative scroll-mt-24 rounded-3xl border-2 border-cyan-400/70 bg-gradient-to-br from-cyan-500/10 via-card to-emerald-500/10 overflow-hidden shadow-[0_0_36px_rgba(34,211,238,0.18)]"
    >
      <div className="bg-gradient-to-r from-cyan-500 via-blue-600 to-emerald-500 px-5 py-2 text-center text-[10px] font-black uppercase tracking-[0.24em] text-white">
        SiteSitter™ · AI Ordinance & Parcel Intelligence · Patent Pending · Powered by HawkPerch
      </div>
      <div className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 text-white shadow-lg">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <div className="font-heading text-xl font-black text-foreground md:text-2xl">
              SiteSitter™ — Instant Tower Feasibility
            </div>
            <div className="mt-1 max-w-3xl text-sm font-medium text-muted-foreground">
              Click any parcel inside the two-mile ring. SiteSitter™ finds the best dry, obstruction-free tower location, calculates the maximum lawful monopole height, and shows APPROVED, REJECTED, or DATA REQUIRED with the controlling reason.
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide">
              <span className="rounded-full border border-cyan-400/50 bg-cyan-500/10 px-2.5 py-1 text-cyan-700 dark:text-cyan-300">AI ordinance analysis</span>
              <span className="rounded-full border border-emerald-400/50 bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-300">Live max-height solver</span>
              <span className="rounded-full border border-violet-400/50 bg-violet-500/10 px-2.5 py-1 text-violet-700 dark:text-violet-300">3 additional sites</span>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setExpanded((value) => !value)}
          className="shrink-0 bg-gradient-to-r from-cyan-600 to-emerald-600 font-extrabold text-white shadow-lg hover:from-cyan-500 hover:to-emerald-500"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {expanded ? "Collapse SiteSitter™" : "Find 3 More SCIP Sites"}
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-cyan-400/30 bg-background/55 p-4 space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
            <p className="flex-1 text-xs font-semibold leading-relaxed text-foreground">
              SiteHawk picked Targets A, B and C. Inside the green two-mile ring, click any parcel: SiteSitter™ checks Realie property data, the governing telecom ordinance, setbacks, fall zone, residential and tower separation, mapped structures, water, and USFWS NWI wetlands—then moves the tower to the strongest buildable point. Double-click a green tower to save Candidate D, E, or F. Three SCIP saves maximum.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleClearAll}
              disabled={!probes.length && !savedTargets.some(Boolean)}
              className="shrink-0 border-destructive/50 font-bold text-destructive hover:bg-destructive/10"
            >
              <Eraser className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>

          {selectionCode && (
            <div className="rounded-xl border-2 border-emerald-400/60 bg-emerald-500/10 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <KeyRound className="h-5 w-5 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Your one-time selection code</div>
                  <div className="font-mono text-xl font-extrabold tracking-wider text-foreground">{selectionCode.code}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    All three of your picks are saved. On the certification form this code goes <b>where your name would go</b> — it is the record that you selected these sites yourself. It works exactly once and can never be used again, so copy it now.
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { navigator.clipboard?.writeText(selectionCode.code); toast({ title: "Code copied" }); }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button
                    size="sm"
                    disabled={selectionCode.status === "redeemed"}
                    onClick={() => { setCertifyDone(false); setCertifyError(""); setCodeInput(""); setCertifyOpen(true); }}
                    className="bg-emerald-600 font-bold text-white hover:bg-emerald-500"
                  >
                    {selectionCode.status === "redeemed" ? (<><BadgeCheck className="h-3.5 w-3.5" /> Certified</>) : "Certification form"}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {resolving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Resolving active Target A…
            </div>
          )}

          {!resolving && !siteTarget && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No active Target A found in the pipeline. Run Section 3 (Targets) or use the manual lookup below.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
            <div className="space-y-3">
              {resolvedFrom && siteTarget && (
                <div className="text-[11px] text-muted-foreground">
                  Target A source: <b className="text-foreground">{resolvedFrom}</b>
                </div>
              )}
              {siteTarget && <SiteTargetSummary target={siteTarget} />}
              {siteTarget && <TowerControls {...controls} onChange={(k, v) => setControls((c) => ({ ...c, [k]: v }))} />}
              {siteTarget && <FitStatusPanel fit={fit} />}
              {siteTarget && <LayerTogglePanel layers={layers} onToggle={(k, v) => setLayers((l) => ({ ...l, [k]: v }))} />}
              {siteTarget && (
                <HawkPerchTargetPicker
                  targets={savedTargets}
                  rejection={rejectedPoint}
                  onClearRejection={() => { setRejectedPoint(null); dismiss(); }}
                  onClear={onClearTarget}
                  onRun={onRunTarget}
                />
              )}
              {siteTarget && (
                <div className="space-y-2">
                  <Button onClick={handleSave} disabled={saveBusy || !fit} className="w-full">
                    {saveBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {savedScenario ? "Update Tower Scenario" : "Save Tower Scenario"}
                  </Button>
                  <ExportMapButton
                    siteTarget={siteTarget}
                    towerLngLat={towerLngLat}
                    fit={fit}
                    disabled={!savedScenario}
                    scenarioId={savedScenario?.id}
                  />
                  {!savedScenario && (
                    <p className="text-[11px] text-muted-foreground">Save the scenario to enable Export Map.</p>
                  )}
                  {/* 3D preview — tied to the real TowerSitingRun / Tower3DRender for this parcel */}
                  {threeD?.run || threeD?.render ? (
                    <Preview3DButton
                      threeD={threeD}
                      onRenderSaved={() => siteTarget && resolve3DContext(siteTarget).then(setThreeD)}
                    />
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      3D preview: generate one from the Tower Siter section above — it stays tied to this Target A's siting run.
                    </p>
                  )}
                </div>
              )}
              <PropertyLookupForm onLookup={handleManualLookup} busy={manualBusy} />
            </div>

            <div className="min-h-[480px]">
              {siteTarget ? (
                <div className="min-h-[480px] h-full">
                  <HawkFitMap
                    siteTarget={siteTarget}
                    towerLngLat={towerLngLat}
                    onTowerMove={handleTowerMove}
                    fit={fit}
                    layers={layers}
                    controls={controls}
                    savedTargets={savedTargets}
                    selectionEnabled={true}
                    onMapSelect={handleMapSelect}
                    onMapProbe={handleMapProbe}
                    probes={probes}
                    explorationRadiusMiles={RING_MILES}
                    onClearSavedTargets={handleClearAll}
                    overlay={aiOverlay}
                    cursorColor={aiEval ? COLOR_HEX[aiEval.color] : null}
                    searchRing={(searchRing || searchCenter) ? { ...(searchRing || searchCenter), radius_miles: Number(searchRing?.radius_miles) || 1 } : null}
                  />
                </div>
              ) : (
                <div className="w-full h-full min-h-[480px] rounded-xl border border-border bg-muted/30 flex items-center justify-center text-sm text-muted-foreground">
                  Resolve a Target A to open the SiteSitter™ map.
                </div>
              )}
            </div>
          </div>

          {siteTarget && (
            <AIEquationPanel
              siteTarget={siteTarget}
              towerLngLat={towerLngLat}
              requestedHeightFt={controls.heightFt}
              onHeightChange={(h) => setControls((c) => ({ ...c, heightFt: h }))}
              rules={aiRules}
              evalResult={aiEval}
              water={water}
              targetA={targetA}
              nearbyTowers={nearbyTowers}
              towerDataAvailable={towerDataAvailable}
              structures={structures}
              structureDataAvailable={structureDataAvailable}
              usePeReduction={solverRules.hasPELetter}
              onOverlayChange={setAiOverlay}
              onPromote={onRunTarget}
            />
          )}

          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Preliminary screen — NOT final engineering, NOT a stamped survey, and NOT a final zoning determination.
          </p>
        </div>
      )}

      {certifyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => !certifyBusy && setCertifyOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
                <BadgeCheck className="h-4 w-4 text-emerald-600" /> Customer Site-Selection Certification
              </div>
              <button type="button" onClick={() => !certifyBusy && setCertifyOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Everything below is already filled out. The only field you complete is the last one — your one-time
                selection code stands in for your name and certifies that <b>you</b> selected these candidates.
              </p>

              <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium text-foreground">{new Date().toLocaleDateString()}</span></div>
                {(() => { const c = getRingCenter(); return c ? (
                  <div className="flex justify-between"><span className="text-muted-foreground">Search ring center</span><span className="font-mono text-foreground">{c.lat.toFixed(6)}, {c.lon.toFixed(6)}</span></div>
                ) : null; })()}
                {zoningResult?._registry?.jurisdiction && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Jurisdiction</span><span className="font-medium text-foreground">{zoningResult._registry.jurisdiction}{zoningResult._registry.state ? `, ${zoningResult._registry.state}` : ""}</span></div>
                )}
                {(selectionCode?.targets || savedTargets).filter(Boolean).map((t, i) => (
                  <div key={SLOT_LETTERS[i]} className="flex justify-between">
                    <span className="text-muted-foreground">Target {SLOT_LETTERS[i]}</span>
                    <span className="font-mono text-foreground">{Number(t.lat).toFixed(6)}, {Number(t.lng).toFixed(6)} · max {t.max_height_ft} ft</span>
                  </div>
                ))}
                <div className="flex justify-between"><span className="text-muted-foreground">Selection source</span><span className="font-bold text-emerald-700">Customer-selected (D/E/F)</span></div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-foreground">
                  Selected by — enter your one-time code (this replaces your name)
                </label>
                <input
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
                  placeholder="HAWK-XXXX-XXXX"
                  disabled={certifyBusy || certifyDone}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm tracking-wider text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {certifyError && <p className="text-xs font-semibold text-destructive">{certifyError}</p>}

              {certifyDone ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-400/60 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-700">
                  <BadgeCheck className="h-4 w-4" /> Certified. Your code is now consumed and can never be used again.
                </div>
              ) : (
                <Button onClick={handleRedeem} disabled={certifyBusy || !codeInput.trim()} className="w-full bg-emerald-600 font-bold text-white hover:bg-emerald-500">
                  {certifyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                  Certify my picks
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}