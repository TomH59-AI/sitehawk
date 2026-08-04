import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Sigma, ChevronDown, ChevronUp, Layers, Save, Loader2, Eraser, FileDown } from "lucide-react";
import { buildBuildableOverlay, TALONFIT_NAME, TALONFIT_TAGLINE, TALONFIT_DEFINITION, AI_EQUATION_NOTICE } from "@/lib/aiEquation";
import { saveTowerScenario } from "@/functions/saveTowerScenario";
import AIEquationResults from "@/components/hawkfit/AIEquationResults";
import AIEquationComparison from "@/components/hawkfit/AIEquationComparison";

// AI Equation – Tower Placement Analyzer. Collapsible control panel inside
// HawkPerch. Reads the live cursor evaluation, generates buildable-area
// overlays, and saves tested positions as separate candidates (never
// overwrites Target A or any pipeline data).
export default function AIEquationPanel({
  siteTarget, towerLngLat, requestedHeightFt, onHeightChange,
  rules, evalResult, water, targetA, onOverlayChange, onPromote,
  nearbyTowers = [], towerDataAvailable = false,
  structures = [], structureDataAvailable = false,
  usePeReduction = false,
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(true);
  const [overlayStats, setOverlayStats] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [saving, setSaving] = useState(false);

  const generateOverlay = () => {
    const result = buildBuildableOverlay({
      parcelGeometry: siteTarget?.parcel_geometry || null,
      requestedHeightFt, rules, waterFeatures: water,
      nearbyTowers, towerDataAvailable,
      structures, structureDataAvailable, usePeReduction,
    });
    if (!result) {
      toast({ title: "No parcel geometry", description: "A parcel boundary is required to compute the buildable area.", variant: "destructive" });
      return;
    }
    setOverlayStats(result.stats);
    onOverlayChange?.(result.fc);
  };

  const clearOverlay = () => { setOverlayStats(null); onOverlayChange?.(null); };

  // Instant recalculation — when the overlay is showing and the proposed
  // height changes, the colored areas recompute automatically.
  useEffect(() => {
    if (!overlayStats) return;
    const result = buildBuildableOverlay({
      parcelGeometry: siteTarget?.parcel_geometry || null,
      requestedHeightFt, rules, waterFeatures: water,
      nearbyTowers, towerDataAvailable,
      structures, structureDataAvailable, usePeReduction,
    });
    if (result) { setOverlayStats(result.stats); onOverlayChange?.(result.fc); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedHeightFt, rules, water, nearbyTowers, towerDataAvailable, structures, structureDataAvailable, usePeReduction, siteTarget]);

  // Promote a saved candidate to Target A — deliberate, confirmed action only.
  // The former Target A is retained: promotion re-runs the pipeline at the new
  // point without overwriting the original coordinates or candidate records.
  const promote = (cand) => {
    const ok = window.confirm(
      `Promote "${cand.name}" (${cand.lat.toFixed(6)}, ${cand.lon.toFixed(6)}) to Target A?\n\nThe current Target A and all pipeline data are retained in project history — this runs the pipeline at the promoted position as a new lane.`
    );
    if (!ok) return;
    onPromote?.({ lat: cand.lat, lng: cand.lon }, cand.name);
  };

  // Export the current evaluation as a plain-text feasibility report.
  const exportReport = () => {
    if (!evalResult) return;
    const e = evalResult;
    const lines = [
      "AI EQUATION — TOWER PLACEMENT FEASIBILITY REPORT",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      `Parcel: ${siteTarget?.parcel_id || siteTarget?.address || "—"}`,
      `Cursor: ${towerLngLat ? `${towerLngLat[1].toFixed(6)}, ${towerLngLat[0].toFixed(6)}` : "—"}`,
      `Requested height: ${Math.round(e.requestedHeightFt)} ft`,
      `Maximum allowed height at cursor: ${e.maxAllowedHeightFt == null ? "Unknown" : `${Math.round(e.maxAllowedHeightFt)} ft`}`,
      `Result: ${e.color.toUpperCase()}`,
      `Approval type: ${e.approvalType || "Unknown"}`,
      "",
      ...(e.failing?.length ? ["FAILING:", ...e.failing.map((r) => `  ✗ ${r}`), ""] : []),
      ...(e.conditional?.length ? ["CONDITIONAL:", ...e.conditional.map((r) => `  ! ${r}`), ""] : []),
      ...(e.missing?.length ? ["MISSING INFORMATION:", ...e.missing.map((r) => `  ? ${r}`), ""] : []),
      ...(e.passing?.length ? ["PASSING:", ...e.passing.map((r) => `  ✓ ${r}`), ""] : []),
      ...(e.peScenario ? [`PE LETTER SCENARIO: ${e.peScenario.result === "pass" ? "Pass" : "Fail"} — ${e.peScenario.detail}`, ""] : []),
      ...(overlayStats ? [
        `Buildable area: ${overlayStats.buildableAcres.toFixed(2)} ac of ${overlayStats.parcelAcres.toFixed(2)} ac (${overlayStats.buildablePct.toFixed(0)}%)`,
        overlayStats.bestPoint ? `Best base point: ${overlayStats.bestPoint.lat.toFixed(6)}, ${overlayStats.bestPoint.lon.toFixed(6)} — max ${overlayStats.bestPoint.maxHeightFt} ft` : "",
        "",
      ] : []),
      ...(e.citations?.length ? ["ORDINANCE SOURCES:", ...e.citations.filter((c) => c.citation || c.url).map((c) => `  ${c.rule}: ${c.citation || ""} ${c.url || ""}`), ""] : []),
      "NOTICE:",
      AI_EQUATION_NOTICE,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ai-equation-feasibility-${(siteTarget?.parcel_id || "parcel").replace(/[^\w-]/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const saveCandidate = async () => {
    if (!evalResult || !towerLngLat) return;
    setSaving(true);
    try {
      const name = `AI Equation Candidate ${candidates.length + 1}`;
      const fitStatus = evalResult.color === "green" ? "works" : evalResult.color === "red" ? "fails" : "needs_review";
      const { data } = await saveTowerScenario({
        site_target: siteTarget,
        scenario: {
          name,
          tower_lat: towerLngLat[1],
          tower_lon: towerLngLat[0],
          tower_height_ft: requestedHeightFt,
          fit_status: fitStatus,
          fit_reasons: [...(evalResult.failing || []), ...(evalResult.conditional || []), ...(evalResult.missing || []), ...(evalResult.passing || [])].slice(0, 20),
        },
        fit: { status: fitStatus, reasons: evalResult.failing?.length ? evalResult.failing : evalResult.passing || [] },
      });
      setCandidates((prev) => [...prev, {
        id: data?.scenario?.id || `local-${Date.now()}`,
        name,
        parcelId: siteTarget?.parcel_id || null,
        lat: towerLngLat[1], lon: towerLngLat[0],
        requestedHeightFt,
        maxHeightFt: evalResult.maxAllowedHeightFt,
        color: evalResult.color,
        approvalType: evalResult.approvalType,
        peResult: evalResult.peScenario?.result || null,
        distFromCarrierFt: evalResult.distFromCarrierFt,
        distFromTargetAFt: evalResult.distFromTargetAFt,
        failing: evalResult.failing,
        missing: evalResult.missing,
        savedAt: new Date().toISOString(),
      }]);
      toast({ title: "Candidate saved", description: `${name} recorded — Target A and pipeline data are untouched.` });
    } catch (e) {
      toast({ title: "Save failed", description: e?.response?.data?.error || e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sigma className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="font-heading font-bold text-sm text-foreground flex items-center gap-2">
              {TALONFIT_NAME} — Tower Placement Feasibility Engine
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">{TALONFIT_TAGLINE}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">Drag the tower cursor — live max-height equation, ordinance rules, buildable overlay & candidates.</div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2 border border-border">
            {TALONFIT_DEFINITION}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Proposed tower height (ft)</label>
              <Input
                type="number" min={100} max={2000} value={requestedHeightFt}
                onChange={(e) => onHeightChange?.(Number(e.target.value) || 0)}
                className="w-32 h-9"
              />
            </div>
            <Button size="sm" variant="outline" onClick={generateOverlay} className="gap-1.5">
              <Layers className="w-4 h-4" /> {overlayStats ? "Recalculate Parcel" : "Buildable-Area Overlay"}
            </Button>
            {overlayStats && (
              <Button size="sm" variant="ghost" onClick={clearOverlay} className="gap-1.5">
                <Eraser className="w-4 h-4" /> Clear Overlay
              </Button>
            )}
            <Button size="sm" onClick={saveCandidate} disabled={saving || !evalResult} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save as New Candidate
            </Button>
            <Button size="sm" variant="outline" onClick={exportReport} disabled={!evalResult} className="gap-1.5">
              <FileDown className="w-4 h-4" /> Export Feasibility Report
            </Button>
          </div>

          <AIEquationResults evalResult={evalResult} siteTarget={siteTarget} overlayStats={overlayStats} />
          <AIEquationComparison candidates={candidates} targetA={targetA} onPromote={onPromote ? promote : null} />
        </div>
      )}
    </div>
  );
}