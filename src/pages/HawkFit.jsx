import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Save, Loader2, Crosshair } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { computeFit, autoPlaceTower } from "@/lib/hawkfitGeometry";
import { lookupRealieProperty } from "@/functions/lookupRealieProperty";
import { saveTowerScenario } from "@/functions/saveTowerScenario";
import HawkFitMap from "@/components/hawkfit/HawkFitMap";
import PropertyLookupForm from "@/components/hawkfit/PropertyLookupForm";
import SiteTargetSummary from "@/components/hawkfit/SiteTargetSummary";
import TowerControls from "@/components/hawkfit/TowerControls";
import FitStatusPanel from "@/components/hawkfit/FitStatusPanel";
import { talonfitRun } from "@/functions/talonfitRun";
import TalonFitCertifiedBadge from "@/components/talonfit/TalonFitCertifiedBadge";
import TalonFitExhibitCard from "@/components/talonfit/TalonFitExhibitCard";
import TalonReachPanel from "@/components/talonreach/TalonReachPanel";
import LayerTogglePanel from "@/components/hawkfit/LayerTogglePanel";
import HawkPerchControls from "@/components/hawkfit/HawkPerchControls";
import ExportMapButton from "@/components/hawkfit/ExportMapButton";

// HawkFit Map — interactive tower-siting: Realie property lookup, parcel
// outline, draggable tower, live fall zone + compound + feasibility status.
export default function HawkFit() {
  const { toast } = useToast();
  const [siteTarget, setSiteTarget] = useState(null);
  const [towerLngLat, setTowerLngLat] = useState(null);
  const [controls, setControls] = useState({
    heightFt: 199, widthFt: 100, depthFt: 100,
    frontSetbackFt: 50, sideSetbackFt: 25, rearSetbackFt: 25,
    maxHeightFt: 199, hasPELetter: false, fallZoneMultiplier: 0.5,
  });
  const [layers, setLayers] = useState({ parcel: true, fallZone: true, compound: true });
  const [lookupBusy, setLookupBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedScenario, setSavedScenario] = useState(null);
  const [talonRun, setTalonRun] = useState(null); // { run_id, certified } from the TalonFit audit log

  const fit = useMemo(() => {
    if (!towerLngLat) return null;
    return computeFit({
      parcelGeometry: siteTarget?.parcel_geometry || null,
      towerLngLat,
      heightFt: controls.heightFt,
      widthFt: controls.widthFt,
      depthFt: controls.depthFt,
      zoning: siteTarget?.zoning || null,
      ...controls,
    });
  }, [siteTarget, towerLngLat, controls]);

  const handleLookup = async (query) => {
    setLookupBusy(true);
    try {
      const res = await lookupRealieProperty(query);
      const target = res.data.target;
      setSiteTarget(target);
      // Start the tower at the best interior spot for the current settings
      // rather than the raw centroid, so the initial verdict is meaningful.
      const placed = target.parcel_geometry
        ? autoPlaceTower({
            parcelGeometry: target.parcel_geometry,
            heightFt: controls.heightFt,
            widthFt: controls.widthFt,
            depthFt: controls.depthFt,
            zoning: target.zoning || null,
            ...controls,
          })
        : null;
      setTowerLngLat(placed?.lngLat || [target.longitude, target.latitude]);
      setSavedScenario(null);
      setTalonRun(null);
      toast({ title: "Property loaded", description: target.address || "Target A ready — auto-placed for best fit. Drag to adjust." });
    } catch (e) {
      toast({
        title: "Lookup failed",
        description: e?.response?.data?.error || e.message,
        variant: "destructive",
      });
    }
    setLookupBusy(false);
  };

  const handleTowerMove = useCallback((lngLat) => setTowerLngLat(lngLat), []);

  // When the user changes tower height or compound size, re-solve the best tower
  // position for the new settings against the parcel (fall zone + compound +
  // zoning setback) and move the pin there. If it can't fit anywhere, snap to the
  // parcel center and let the Fit Status panel report the failure.
  const handleControlChange = (key, value) => {
    setControls((prev) => {
      const next = { ...prev, [key]: value };
      if (siteTarget?.parcel_geometry) {
        const placed = autoPlaceTower({
          parcelGeometry: siteTarget.parcel_geometry,
          heightFt: next.heightFt,
          widthFt: next.widthFt,
          depthFt: next.depthFt,
          zoning: siteTarget.zoning || null,
          ...next,
        });
        if (placed.lngLat) {
          setTowerLngLat(placed.lngLat);
          if (!placed.fits) {
            toast({
              title: "Won't fit at these settings",
              description: "No spot clears the active HawkPerch fall zone, compound, and ordinance settings.",
              variant: "destructive",
            });
          }
        }
      }
      return next;
    });
  };
  const handleLayerToggle = (key, value) => setLayers((l) => ({ ...l, [key]: value }));

  const handleSave = async () => {
    setSaveBusy(true);
    try {
      const res = await saveTowerScenario({
        site_target: siteTarget,
        scenario: {
          id: savedScenario?.id,
          name: siteTarget.address || siteTarget.parcel_id || "Tower Scenario",
          tower_lat: towerLngLat[1],
          tower_lon: towerLngLat[0],
          tower_height_ft: controls.heightFt,
          compound_width_ft: controls.widthFt,
          compound_depth_ft: controls.depthFt,
          fit_status: fit.status,
          fit_reasons: fit.reasons,
          hawkperch_error_code: fit.errorCode || undefined,
          edge_distance_ft: fit.edgeDistanceFt,
          max_available_height_ft: fit.maxAvailableHeight,
          hawkperch_config: {
            front_setback_ft: controls.frontSetbackFt,
            side_setback_ft: controls.sideSetbackFt,
            rear_setback_ft: controls.rearSetbackFt,
            max_height_ft: controls.maxHeightFt,
            has_pe_letter: controls.hasPELetter,
            fall_zone_multiplier: controls.hasPELetter ? controls.fallZoneMultiplier : 1,
          },
        },
      });
      // Remember the saved SiteTarget + TowerScenario ids so re-saves update, not duplicate.
      setSiteTarget((t) => ({ ...t, id: res.data.site_target_id }));
      setSavedScenario(res.data.scenario || { id: res.data.tower_scenario_id });
      toast({ title: "Scenario saved", description: "Export Map is now enabled." });
      // TalonFit® certification + audit log (rate-limited server-side)
      try {
        const certified = fit?.status === "works";
        const { data: tf } = await talonfitRun({
          source: "hawkperch",
          parcel_id: siteTarget.parcel_id || null,
          latitude: towerLngLat[1],
          longitude: towerLngLat[0],
          jurisdiction: siteTarget.jurisdiction || null,
          tower_height_ft: controls.heightFt,
          max_height_ft: fit?.maxAvailableHeight ?? null,
          binding_constraint: fit?.errorCode || fit?.reasons?.[0] || "Fall-zone / property-line clearance",
          feasible: certified,
          result_class: fit?.status || null,
        });
        setTalonRun({ run_id: tf?.run_id, certified });
      } catch (err) {
        if (err?.response?.status === 429) {
          toast({ title: "TalonFit rate limit", description: err.response.data?.error, variant: "destructive" });
        }
        console.error("TalonFit audit log failed:", err);
      }
    } catch (e) {
      toast({ title: "Save failed", description: e?.response?.data?.error || e.message, variant: "destructive" });
    }
    setSaveBusy(false);
  };

  return (
    <div className="h-[calc(100vh-8rem)] min-h-[560px] flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Crosshair className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">HawkPerch</h1>
          <p className="text-sm text-muted-foreground">SiteHawk AI siting solver — test Target A placement live.</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 min-h-0">
        <div className="space-y-4 overflow-y-auto pr-1">
          <PropertyLookupForm onLookup={handleLookup} busy={lookupBusy} />
          {siteTarget && (
            <>
              <SiteTargetSummary target={siteTarget} />
              <TowerControls {...controls} onChange={handleControlChange} />
              <HawkPerchControls controls={controls} onChange={handleControlChange} />
              <FitStatusPanel fit={fit} />
              {talonRun?.certified && <TalonFitCertifiedBadge runId={talonRun.run_id} />}
              {talonRun?.run_id && fit && towerLngLat && (
                <TalonFitExhibitCard
                  exhibit={{
                    parcelGeometry: siteTarget?.parcel_geometry || null,
                    compoundGeometry: fit.compound?.geometry || null,
                    fallZoneGeometry: fit.fallZone?.geometry || null,
                    towerLngLat,
                    setbackFt: fit.setbackFt || 0,
                    verdict: fit.status === "works" ? "FITS" : fit.status === "fails" ? "DOES NOT FIT" : "CONDITIONAL",
                    meta: {
                      siteLabel: siteTarget?.address || siteTarget?.parcel_id || "Tower Site",
                      apn: siteTarget?.parcel_id || null,
                      jurisdiction: siteTarget?.jurisdiction || null,
                      owner: siteTarget?.owner || null,
                      heightFt: controls.heightFt,
                      compoundW: controls.widthFt,
                      compoundD: controls.depthFt,
                      fallRadiusFt: Math.round(controls.heightFt * (fit.fallZoneMultiplier || 1)),
                      setbackFt: Math.round(fit.setbackFt || 0),
                      runId: talonRun.run_id,
                    },
                  }}
                />
              )}
              {talonRun?.run_id && towerLngLat && (
                <TalonReachPanel
                  source="hawkperch"
                  siteLabel={siteTarget?.address || siteTarget?.parcel_id || "Tower Site"}
                  parcelId={siteTarget?.parcel_id || null}
                  jurisdiction={siteTarget?.jurisdiction || null}
                  latitude={towerLngLat[1]}
                  longitude={towerLngLat[0]}
                  heightFt={Number(controls.heightFt) || 199}
                />
              )}
              <LayerTogglePanel layers={layers} onToggle={handleLayerToggle} />
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
              </div>
            </>
          )}
        </div>
        <div className="min-h-[420px]">
          <HawkFitMap
            siteTarget={siteTarget}
            towerLngLat={towerLngLat}
            onTowerMove={handleTowerMove}
            fit={fit}
            layers={layers}
            controls={controls}
          />
        </div>
      </div>
    </div>
  );
}