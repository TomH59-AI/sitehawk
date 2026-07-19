import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Crosshair, ChevronDown, ChevronUp, Save, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { computeFit, autoPlaceTower } from "@/lib/hawkfitGeometry";
import { buildOrdinanceRules, evaluatePoint, COLOR_HEX } from "@/lib/aiEquation";
import { resolveActiveTargetA, resolve3DContext } from "@/lib/hawkfitTargetResolver";
import { lookupRealieProperty } from "@/functions/lookupRealieProperty";
import { saveTowerScenario } from "@/functions/saveTowerScenario";
import { hawkfitWaterBodies } from "@/functions/hawkfitWaterBodies";
import HawkFitMap from "@/components/hawkfit/HawkFitMap";
import PropertyLookupForm from "@/components/hawkfit/PropertyLookupForm";
import SiteTargetSummary from "@/components/hawkfit/SiteTargetSummary";
import TowerControls from "@/components/hawkfit/TowerControls";
import FitStatusPanel from "@/components/hawkfit/FitStatusPanel";
import LayerTogglePanel from "@/components/hawkfit/LayerTogglePanel";
import ExportMapButton from "@/components/hawkfit/ExportMapButton";
import Preview3DButton from "@/components/hawkfit/Preview3DButton";
import HawkPerchTargetPicker from "@/components/hawkfit/HawkPerchTargetPicker";
import HawkPerch3DView from "@/components/hawkfit/HawkPerch3DView";
import AIEquationPanel from "@/components/hawkfit/AIEquationPanel";

const stripEmpty = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== ""));

// HawkFit Map — pipeline-embedded section, mounted AFTER the Tower Siter /
// Preliminary Tower Siting Exhibit. Consumes the SAME active Target A as the
// SCIP pipeline (ScipRecord.parcel_targets → SearchResult → TowerSitingRun →
// TowerVisualization → Tower3DRender) and runs deterministic turf fit checks.
export default function HawkFitPipelineSection({ unlocked, targetA, towerHeightFt, savedTargets = [], onSaveTarget, onClearTarget, onRunTarget, zoningResult = null, searchCenter = null }) {
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
  const [manualBusy, setManualBusy] = useState(false);
  const [water, setWater] = useState(null); // water-body FeatureCollection near the target
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
        // Fetch nearby water, then auto-place the tower on dry land inside the parcel.
        let waterFC = null;
        try {
          const { data } = await hawkfitWaterBodies({ lat: t.latitude, lon: t.longitude });
          waterFC = data?.water || null;
        } catch { /* no water data — placement falls back to boundary-only */ }
        if (cancelled) return;
        setWater(waterFC);
        let placed = [t.longitude, t.latitude];
        if (t.parcel_geometry) {
          const auto = autoPlaceTower({
            parcelGeometry: t.parcel_geometry,
            heightFt: controls.heightFt, widthFt: controls.widthFt, depthFt: controls.depthFt,
            zoning: t.zoning || null, waterFeatures: waterFC,
          });
          if (auto?.lngLat) placed = auto.lngLat;
        }
        setTowerLngLat(placed);
        resolve3DContext(t).then((ctx) => { if (!cancelled) setThreeD(ctx); });
      } else {
        setWater(null);
        setTowerLngLat(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, targetKey]);

  const fit = useMemo(() => {
    if (!towerLngLat) return null;
    return computeFit({
      parcelGeometry: siteTarget?.parcel_geometry || null,
      towerLngLat,
      heightFt: controls.heightFt,
      widthFt: controls.widthFt,
      depthFt: controls.depthFt,
      zoning: siteTarget?.zoning || null,
      waterFeatures: water,
    });
  }, [siteTarget, towerLngLat, controls, water]);

  const handleTowerMove = useCallback((lngLat) => setTowerLngLat(lngLat), []);

  // AI Equation — structured ordinance rules from the pipeline's Section 2
  // zoning result, evaluated live at the current cursor position.
  const aiRules = useMemo(() => buildOrdinanceRules(zoningResult), [zoningResult]);
  const aiEval = useMemo(() => {
    if (!towerLngLat) return null;
    return evaluatePoint({
      parcelGeometry: siteTarget?.parcel_geometry || null,
      towerLngLat,
      requestedHeightFt: controls.heightFt,
      rules: aiRules,
      waterFeatures: water,
      carrierCenter: searchCenter,
      targetA,
    });
  }, [siteTarget, towerLngLat, controls.heightFt, aiRules, water, searchCenter, targetA]);

  const handleMapSelect = useCallback((point) => {
    const slot = savedTargets.findIndex((target) => !target);
    if (slot === -1 || !siteTarget) return;
    const pointLngLat = [point.lng, point.lat];
    const pointFit = computeFit({
      parcelGeometry: siteTarget.parcel_geometry || null,
      towerLngLat: pointLngLat,
      heightFt: controls.heightFt,
      widthFt: controls.widthFt,
      depthFt: controls.depthFt,
      zoning: siteTarget.zoning || null,
      waterFeatures: water,
    });
    setTowerLngLat(pointLngLat);
    if (pointFit.status !== "works") {
      const reason = pointFit.reasons?.[0] || "The selected point does not meet the active HawkPerch requirements.";
      setRejectedPoint({ ...point, reason });
      toast({ title: "Location rejected", description: reason, variant: "destructive" });
      return;
    }
    setRejectedPoint(null);
    onSaveTarget?.(slot, point);
    toast({ title: `Target ${["D", "E", "F"][slot]} saved`, description: `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` });
  }, [savedTargets, siteTarget, controls, water, onSaveTarget, toast]);

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
      let waterFC = null;
      try {
        const wr = await hawkfitWaterBodies({ lat: t.latitude, lon: t.longitude });
        waterFC = wr?.data?.water || null;
      } catch { /* no water data */ }
      setWater(waterFC);
      let placed = [t.longitude, t.latitude];
      if (t.parcel_geometry) {
        const auto = autoPlaceTower({
          parcelGeometry: t.parcel_geometry,
          heightFt: controls.heightFt, widthFt: controls.widthFt, depthFt: controls.depthFt,
          zoning: t.zoning || null, waterFeatures: waterFC,
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
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Crosshair className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="font-heading font-bold text-foreground">HawkFit Map</div>
            <div className="text-xs text-muted-foreground">
              Deterministic fall-zone + compound fit checks on the active Target A.
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {expanded ? "Collapse" : "Open HawkFit"}
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
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
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 h-full">
                  <div className="min-h-[480px]">
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
                    />
                  </div>
                  <div className="min-h-[480px]">
                    <HawkPerch3DView
                      siteTarget={siteTarget}
                      towerLngLat={towerLngLat}
                      fit={fit}
                      controls={controls}
                      savedTargets={savedTargets}
                    />
                  </div>
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
              onOverlayChange={setAiOverlay}
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