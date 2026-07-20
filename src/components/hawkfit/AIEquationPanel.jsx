import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Sigma, ChevronDown, ChevronUp, Layers, Save, Loader2, Eraser } from "lucide-react";
import { buildBuildableOverlay, TALONFIT_NAME, TALONFIT_TAGLINE, TALONFIT_DEFINITION } from "@/lib/aiEquation";
import { saveTowerScenario } from "@/functions/saveTowerScenario";
import AIEquationResults from "@/components/hawkfit/AIEquationResults";
import AIEquationComparison from "@/components/hawkfit/AIEquationComparison";

// AI Equation – Tower Placement Analyzer. Collapsible control panel inside
// HawkPerch. Reads the live cursor evaluation, generates buildable-area
// overlays, and saves tested positions as separate candidates (never
// overwrites Target A or any pipeline data).
export default function AIEquationPanel({
  siteTarget, towerLngLat, requestedHeightFt, onHeightChange,
  rules, evalResult, water, targetA, onOverlayChange,
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
    });
    if (!result) {
      toast({ title: "No parcel geometry", description: "A parcel boundary is required to compute the buildable area.", variant: "destructive" });
      return;
    }
    setOverlayStats(result.stats);
    onOverlayChange?.(result.fc);
  };

  const clearOverlay = () => { setOverlayStats(null); onOverlayChange?.(null); };

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
          </div>

          <AIEquationResults evalResult={evalResult} siteTarget={siteTarget} overlayStats={overlayStats} />
          <AIEquationComparison candidates={candidates} targetA={targetA} />
        </div>
      )}
    </div>
  );
}