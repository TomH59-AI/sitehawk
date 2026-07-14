/**
 * FeasibilityFinder — shows ONLY when the current siting collapses ("won't fit").
 * Lets the user play with tower height live and, using the jurisdiction's zoning
 * rules + parcel boundary + PE-letter fall-zone relief, finds where on THIS
 * parcel a tower CAN be constructed (SUP/CUP path). Applying a fix re-runs the
 * engine, which auto-sites the tower at the deepest buildable point and draws
 * the buildable envelope on the map — the coordinates move, not the parcel.
 */
import { useState, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Wand2, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { recompute } from "@/lib/towerSiterEngine";
import { normalizeOrdinanceRules } from "@/lib/towerSiterResult";

const MIN_H = 50;

export default function FeasibilityFinder({ parcelGeoJSON, locationPoint, rules, controls, buildingsFC, peAllowed, onApply }) {
  const startH = Number(controls.heightFt) || 199;
  const [tryH, setTryH] = useState(startH);

  const test = (h, pe) => {
    try {
      const nr = normalizeOrdinanceRules(rules, h) || rules;
      const r = recompute({
        parcelGeoJSON, locationPoint, rules: nr,
        towerHeightFt: h, peToggle: pe,
        engineeredFallRadiusFt: pe && controls.peRadiusFt !== "" ? Number(controls.peRadiusFt) : undefined,
        compoundW: Number(controls.compoundW) || 75,
        compoundD: Number(controls.compoundD) || 75,
        buildingFootprints: buildingsFC,
      });
      return !r.collapsed && r.checks?.allPass !== false;
    } catch { return false; }
  };

  // Max feasible heights — 5′ steps down from the requested height.
  const { maxAsIs, maxWithPe } = useMemo(() => {
    let asIs = null, withPe = null;
    for (let h = Math.floor(startH / 5) * 5; h >= MIN_H; h -= 5) {
      if (asIs === null && test(h, false)) asIs = h;
      if (peAllowed && withPe === null && test(h, true)) withPe = h;
      if (asIs !== null && (withPe !== null || !peAllowed)) break;
    }
    return { maxAsIs: asIs, maxWithPe: withPe };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelGeoJSON, rules, buildingsFC, controls.compoundW, controls.compoundD, controls.peRadiusFt, peAllowed, startH]);

  const fitsAsIs = useMemo(() => test(tryH, false), [tryH]); // eslint-disable-line react-hooks/exhaustive-deps
  const fitsWithPe = useMemo(() => (peAllowed ? test(tryH, true) : false), [tryH, peAllowed]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-3 space-y-3 text-sm">
      <div className="flex items-center gap-2 font-heading font-bold text-cyan-200">
        <Wand2 className="w-4 h-4" /> Make it fit — what-if on this parcel
      </div>

      {/* Live height play */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-cyan-100/80">
          <span>Try tower height: <b className="text-white">{tryH}′</b></span>
          <span className="flex items-center gap-3">
            <span className={`flex items-center gap-1 font-semibold ${fitsAsIs ? "text-emerald-300" : "text-red-300"}`}>
              {fitsAsIs ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />} as-is
            </span>
            {peAllowed && (
              <span className={`flex items-center gap-1 font-semibold ${fitsWithPe ? "text-emerald-300" : "text-red-300"}`}>
                {fitsWithPe ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />} with PE letter
              </span>
            )}
          </span>
        </div>
        <Slider min={MIN_H} max={startH} step={5} value={[tryH]} onValueChange={([v]) => setTryH(v)} />
      </div>

      {/* Computed fixes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {maxAsIs !== null ? (
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500" onClick={() => onApply({ heightFt: maxAsIs, peToggle: false })}>
            <CheckCircle2 className="w-4 h-4 mr-1" /> Fits at {maxAsIs}′ — apply & show placement
          </Button>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
            No height down to {MIN_H}′ fits under the standard fall-zone setback.
          </div>
        )}
        {peAllowed && maxWithPe !== null && (
          <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500" onClick={() => onApply({ heightFt: maxWithPe, peToggle: true })}>
            <ShieldCheck className="w-4 h-4 mr-1" /> PE letter: fits at {maxWithPe}′ — apply
          </Button>
        )}
      </div>

      <p className="text-xs text-cyan-100/70 leading-snug">
        Applying a fix keeps this parcel and re-sites the tower at the deepest compliant point —
        the green buildable envelope on the map shows exactly where it can be constructed under
        the jurisdiction's zoning with a <b>SUP/CUP</b>{peAllowed ? " and an engineered PE fall-zone letter" : ""}.
        Only the tower coordinates move on the property; verify final placement with the jurisdiction.
      </p>
    </div>
  );
}