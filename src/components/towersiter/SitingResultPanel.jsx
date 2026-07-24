/**
 * SitingResultPanel — right-panel summary for a completed Tower Siter run.
 * Shows result class badge, all check rows, warnings, and the full disclaimer.
 */
import { CheckCircle2, XCircle, MinusCircle, AlertTriangle, Info, ExternalLink } from "lucide-react";
import { getResultMeta } from "@/lib/towerSiterResult";
import TalonFitTagline from "@/components/talonfit/TalonFitTagline";

const DISCLAIMER = "Preliminary automated siting exhibit only. Not a stamped survey, zoning determination, construction drawing, or final tower location. Final placement must be verified by surveyor, engineer, and jurisdictional review.";

const COLOR_CLASSES = {
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  yellow:  "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  cyan:    "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  red:     "border-red-500/50 bg-red-500/10 text-red-300",
  orange:  "border-orange-500/40 bg-orange-500/10 text-orange-300",
  amber:   "border-amber-500/40 bg-amber-500/10 text-amber-300",
  slate:   "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

function CheckRow({ label, status, detail }) {
  const icon = status === "pass"
    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
    : status === "fail"
    ? <XCircle className="w-4 h-4 text-red-400 shrink-0" />
    : <MinusCircle className="w-4 h-4 text-slate-400 shrink-0" />;
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
      {icon}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-white/80 font-semibold">{label}</span>
        {detail && <p className="text-[11px] text-white/45 mt-0.5 leading-snug">{detail}</p>}
      </div>
    </div>
  );
}

export default function SitingResultPanel({ result, resultClass, checks, towerSeparation, residential, warnings = [], rules }) {
  if (!result || result.collapsed) return null;

  const meta = getResultMeta(resultClass);
  const colorClass = COLOR_CLASSES[meta.color] || COLOR_CLASSES.slate;

  const c = checks || {};

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3 text-sm">
      {/* Result badge */}
      <div className={`rounded-lg border px-3 py-2 font-bold text-sm flex items-center gap-2 ${colorClass}`}>
        {meta.feasible === true && <CheckCircle2 className="w-4 h-4 shrink-0" />}
        {meta.feasible === false && <XCircle className="w-4 h-4 shrink-0" />}
        {meta.feasible === null && <AlertTriangle className="w-4 h-4 shrink-0" />}
        {meta.label}
      </div>

      {/* Tower location */}
      {result.towerLonLat && (
        <div className="rounded bg-white/5 px-3 py-2 space-y-1">
          <p className="text-[11px] text-white/40 uppercase tracking-wider font-semibold">Proposed Tower Location</p>
          <p className="text-white font-mono text-xs">
            {result.towerLonLat[1].toFixed(6)}, {result.towerLonLat[0].toFixed(6)}
          </p>
          {result.clearanceFt != null && (
            <p className="text-[11px] text-white/50">Available clearance: {Math.round(result.clearanceFt).toLocaleString()}′</p>
          )}
        </div>
      )}

      {/* Checks */}
      <div className="rounded bg-white/5 px-3 py-1">
        <p className="text-[11px] text-white/40 uppercase tracking-wider font-semibold mb-1">Compliance Checks</p>

        {c.height && (
          <CheckRow label="Height cap" status={c.height.status} detail={c.height.label} />
        )}
        {c.setback && (
          <CheckRow label="Property setback" status={c.setback.status} detail={c.setback.label} />
        )}
        {c.fallZone && (
          <CheckRow label="Fall-zone containment" status={c.fallZone.status} detail={c.fallZone.label} />
        )}
        {c.compound && (
          <CheckRow label="Compound fit" status={c.compound.status} detail={c.compound.label} />
        )}

        {/* Tower separation */}
        {towerSeparation && (
          <CheckRow
            label="Existing tower separation"
            status={towerSeparation.status === "skip" ? "skip" : towerSeparation.status}
            detail={towerSeparation.message}
          />
        )}

        {/* Residential separation */}
        {residential?.result && (
          <CheckRow
            label="Residential separation"
            status={residential.result.status}
            detail={residential.result.label + (residential.result.offendingAddress ? ` — ${residential.result.offendingAddress}` : "")}
          />
        )}
      </div>

      {/* Rules used */}
      {rules && (
        <div className="rounded bg-white/5 px-3 py-2 space-y-1">
          <p className="text-[11px] text-white/40 uppercase tracking-wider font-semibold">Rules Applied</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-white/55">
            {rules.height_limit_ft != null && <span>Height cap: <b className="text-white/80">{rules.height_limit_ft}′</b></span>}
            {rules.setback_ft != null && <span>Setback: <b className="text-white/80">{rules.setback_ft}′</b></span>}
            {rules.fall_zone_ft != null && <span>Fall zone: <b className="text-white/80">{rules.fall_zone_ft}′</b></span>}
            {rules.tower_separation_ft != null && <span>Tower sep.: <b className="text-white/80">{rules.tower_separation_ft}′</b></span>}
            {rules.residential_separation_ft != null && <span>Res. sep.: <b className="text-white/80">{rules.residential_separation_ft}′</b></span>}
            {rules.measured_from && <span>Measured from: <b className="text-white/80">{rules.measured_from}</b></span>}
            {rules.permit_type && <span>Permit: <b className="text-white/80">{rules.permit_type}</b></span>}
          </div>
          {rules.source_url && (
            <a href={rules.source_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 mt-1">
              Ordinance source <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1.5">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded bg-red-900/20 border border-red-500/30 px-3 py-2 text-[11px] text-red-200">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
        <span>{DISCLAIMER}</span>
      </div>

      <TalonFitTagline />
    </div>
  );
}