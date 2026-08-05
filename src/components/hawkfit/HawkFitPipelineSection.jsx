import { useState, useEffect, useMemo, useCallback } from "react";
import { distance as turfDistance } from "@turf/turf";
import { Button } from "@/components/ui/button";
import { Sparkles, ChevronDown, ChevronUp, Save, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { computeFit, autoPlaceTower } from "@/lib/hawkfitGeometry";
import { buildOrdinanceRules, evaluatePoint, COLOR_HEX } from "@/lib/aiEquation";
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
  const [expanded, setExpanded] = useState(true);
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

  const handleMapSelect = useCallback((point) => {
    const slot = savedTargets.findIndex((target) => !target);
    if (slot === -1 || !siteTarget) return;
    const pointLngLat = [point.lng, point.lat];
    setTowerLngLat(pointLngLat);

    const ringSource = searchRing || searchCenter;
    const centerLat = Number(ringSource?.lat);
    const centerLon = Number(ringSource?.lon);
    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) {
      const reason = "Search-ring center is unavailable, so the required one-mile limit cannot be verified.";
      setRejectedPoint({ ...point, reason });
      toast({ title: "REJECTED", description: reason, variant: "destructive" });
      return;
    }
    const milesFromCenter = turfDistance(pointLngLat, [centerLon, centerLat], { units: "miles" });
    if (milesFromCenter > 1) {
      const reason = `Outside the one-mile TalonFit search ring (${milesFromCenter.toFixed(2)} miles from center).`;
      setRejectedPoint({ ...point, reason });
      toast({ title: "REJECTED", description: reason, variant: "destructive" });
      return;
    }

    const pointFit = evaluateFitAt(pointLngLat);
    if (pointFit?.status !== "works") {
      const reason = pointFit?.aiEvaluation?.failing?.[0]
        || pointFit?.aiEvaluation?.conditional?.[0]
        || pointFit?.aiEvaluation?.missing?.[0]
        || pointFit?.reasons?.[0]
        || "The selected point does not meet the active TalonFit requirements.";
      setRejectedPoint({ ...point, reason });
      toast({ title: "REJECTED", description: reason, variant: "destructive" });
      return;
    }

    const maxHeightFt = Math.floor(pointFit.maxAvailableHeight);
    const savedPoint = {
      ...point,
      max_height_ft: maxHeightFt,
      tower_height_ft: Math.min(controls.heightFt, maxHeightFt),
      pe_letter_required: solverRules.hasPELetter,
      distance_from_ring_center_miles: milesFromCenter,
      decision_status: "approved",
      binding_constraint: pointFit.aiEvaluation?.passing?.find((reason) => /height|setback|fall zone/i.test(reason))
        || pointFit.reasons?.[0]
        || null,
    };
    setRejectedPoint(null);
    onSaveTarget?.(slot, savedPoint);
    toast({
      title: `Target ${["D", "E", "F"][slot]} approved and saved`,
      description: `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)} · maximum ${maxHeightFt} ft`,
    });
  }, [savedTargets, siteTarget, searchRing, searchCenter, evaluateFitAt, controls.heightFt, solverRules.hasPELetter, onSaveTarget, toast]);

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
        AI-Powered Ordinance Intelligence · Patent Pending · Powered by HawkPerch
      </div>
      <div className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 text-white shadow-lg">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <div className="font-heading text-xl font-black text-foreground md:text-2xl">
              TalonFit® AI — Instant Tower Feasibility
            </div>
            <div className="mt-1 max-w-3xl text-sm font-medium text-muted-foreground">
              Click any property to calculate its maximum buildable tower height—or receive an immediate rejection with the exact reason.
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
          {expanded ? "Collapse TalonFit AI" : "Find 3 More Approved Sites"}
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-cyan-400/30 bg-background/55 p-4 space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
            <p className="text-xs font-semibold leading-relaxed text-foreground">
              TalonFit AI reads the jurisdiction rules, applies setbacks, height limits, fall-zone and PE-letter allowances, checks tower and off-parcel structure separation, and explains every approval or rejection.
            </p>
          </div>
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
                    selectionEnabled={savedTargets.some((target) => !target)}
                    onMapSelect={handleMapSelect}
                    onClearSavedTargets={() => savedTargets.forEach((target, index) => target && onClearTarget?.(index))}
                    overlay={aiOverlay}
                    cursorColor={aiEval ? COLOR_HEX[aiEval.color] : null}
                    searchRing={(searchRing || searchCenter) ? { ...(searchRing || searchCenter), radius_miles: 1 } : null}
                  />
                </div>
              ) : (
                <div className="w-full h-full min-h-[480px] rounded-xl border border-border bg-muted/30 flex items-center justify-center text-sm text-muted-foreground">
                  Resolve a Target A to open the HawkFit map.
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
    </div>
  );
}